import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

// ── Fix 2: CORS restrito ao domínio do hub ──────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://hub.2asfinancas.com',
  'https://app.2asfinancas.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
]

// ── Fix 3: slugs de painel válidos ──────────────────────────────────────────
const VALID_PANEL_SLUGS = new Set([
  'financas', 'brand', 'direcao', 'cancelamentos', 'orcamento', 'admissao', 'painel',
])

// ── Fix 5: rate limiting simples por IP ─────────────────────────────────────
// Por instância serverless — protege contra bursts, não substitui WAF
const rateMap = new Map() // ip → { count, resetAt }
const RATE_LIMIT    = 30   // máx. requests
const RATE_WINDOW   = 60   // segundos
function checkRateLimit(ip) {
  const now  = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW * 1000 })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function verifyAdmin(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const supa  = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return false
  const admin = adminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin'
}

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  const origin = req.headers.origin || ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Muitas requisições. Aguarde e tente novamente.' })
  }

  if (!SERVICE_KEY) {
    return res.status(503).json({ error: 'Serviço temporariamente indisponível.' })
  }

  const isAdmin = await verifyAdmin(req.headers.authorization)
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado.' })

  const supa = adminClient()

  // ── GET → lista usuários ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data: { users }, error: authError } = await supa.auth.admin.listUsers()
    if (authError) {
      console.error('[admin/users] listUsers:', authError.message)
      return res.status(500).json({ error: 'Erro ao carregar usuários.' })
    }

    const { data: profiles } = await supa.from('profiles').select('*')
    const { data: panelRows } = await supa.from('user_panels').select('user_id, panel')

    const profileMap = {}
    ;(profiles || []).forEach(p => { profileMap[p.id] = p })

    const panelMap = {}
    ;(panelRows || []).forEach(r => {
      if (!panelMap[r.user_id]) panelMap[r.user_id] = []
      panelMap[r.user_id].push(r.panel)
    })

    const result = (users || []).map(u => ({
      id:           u.id,
      email:        u.email,
      nome:         profileMap[u.id]?.nome || '',
      role:         profileMap[u.id]?.role || 'user',
      panels:       panelMap[u.id] || [],
      confirmed:    !!u.email_confirmed_at,
      last_sign_in: u.last_sign_in_at,
      created_at:   u.created_at,
    }))

    return res.status(200).json(result)
  }

  // ── POST → cria usuário ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nome, email, password, role, panels } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
    }

    // Fix 3: valida role
    const safeRole = role === 'admin' ? 'admin' : 'user'

    // Fix 3: filtra slugs inválidos
    const safePanels = Array.isArray(panels)
      ? panels.filter(p => VALID_PANEL_SLUGS.has(p))
      : []

    const { data: { user }, error: createError } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (createError) {
      console.error('[admin/users] createUser:', createError.message)
      // Preserva mensagens de validação úteis para o admin; descarta erros internos
      const safeMsg = ['User already registered', 'Invalid email'].some(m => createError.message?.includes(m))
        ? createError.message
        : 'Erro ao criar usuário.'
      return res.status(400).json({ error: safeMsg })
    }

    await supa.from('profiles').upsert({
      id: user.id, email, nome: nome || '', role: safeRole,
    })

    if (safePanels.length > 0) {
      await supa.from('user_panels').insert(
        safePanels.map(p => ({ user_id: user.id, panel: p }))
      )
    }

    return res.status(201).json({ id: user.id, email, nome, role: safeRole, panels: safePanels })
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
