import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

// ── Fix 2: CORS restrito ao domínio do hub ──────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://hub.luniqfinancas.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
]

// ── Fix 3: slugs de painel válidos ──────────────────────────────────────────
const VALID_PANEL_SLUGS = new Set(['financas', 'aulas', 'brand', 'direcao'])

// ── Fix 5: rate limiting simples por IP ─────────────────────────────────────
const rateMap = new Map()
const RATE_LIMIT  = 30
const RATE_WINDOW = 60 // segundos
function checkRateLimit(ip) {
  const now   = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW * 1000 })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ── Fix 3: valida UUID antes de passar ao Supabase ──────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isValidUUID(id) { return UUID_RE.test(id) }

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
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS')
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

  // Fix 3: valida UUID do id
  const { id } = req.query
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'ID de usuário inválido.' })
  }

  const supa = adminClient()

  // ── PATCH → atualiza nome, role, senha e painéis ──────────────────────────
  if (req.method === 'PATCH') {
    const { nome, role, panels, password } = req.body || {}

    if (password) {
      if (typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres.' })
      }
      const { error: authError } = await supa.auth.admin.updateUserById(id, { password })
      if (authError) return res.status(400).json({ error: authError.message })
    }

    const profileUpdate = {}
    if (nome !== undefined) profileUpdate.nome = String(nome).slice(0, 200)
    // Fix 3: valida role
    if (role !== undefined) profileUpdate.role = role === 'admin' ? 'admin' : 'user'

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supa
        .from('profiles').update(profileUpdate).eq('id', id)
      if (profileError) return res.status(400).json({ error: profileError.message })
    }

    // Fix 3: filtra slugs inválidos
    if (Array.isArray(panels)) {
      const safePanels = panels.filter(p => VALID_PANEL_SLUGS.has(p))
      await supa.from('user_panels').delete().eq('user_id', id)
      if (safePanels.length > 0) {
        const { error: panelError } = await supa
          .from('user_panels').insert(safePanels.map(p => ({ user_id: id, panel: p })))
        if (panelError) return res.status(400).json({ error: panelError.message })
      }
    }

    return res.status(200).json({ ok: true })
  }

  // ── DELETE → remove usuário completamente ─────────────────────────────────
  if (req.method === 'DELETE') {
    await supa.from('user_panels').delete().eq('user_id', id)
    await supa.from('profiles').delete().eq('id', id)
    const { error: deleteError } = await supa.auth.admin.deleteUser(id)
    if (deleteError) return res.status(400).json({ error: deleteError.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
