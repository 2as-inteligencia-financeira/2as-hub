import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY      = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

// Cliente com service role (acesso total)
function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Verifica se o token do caller é de um admin
async function verifyAdmin(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  // Valida o JWT com o anon key
  const supa = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return false
  // Usa o service role para buscar o perfil (bypassa RLS)
  const admin = adminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Verificação de admin
  if (!SERVICE_KEY) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurado no servidor.' })
  }
  const isAdmin = await verifyAdmin(req.headers.authorization)
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado.' })

  const supa = adminClient()

  // ── GET → lista todos os usuários ──────────────────────────
  if (req.method === 'GET') {
    const { data: { users }, error: authError } = await supa.auth.admin.listUsers()
    if (authError) return res.status(500).json({ error: authError.message })

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
      id:             u.id,
      email:          u.email,
      nome:           profileMap[u.id]?.nome || '',
      role:           profileMap[u.id]?.role || 'user',
      panels:         panelMap[u.id] || [],
      confirmed:      !!u.email_confirmed_at,
      last_sign_in:   u.last_sign_in_at,
      created_at:     u.created_at,
    }))

    return res.status(200).json(result)
  }

  // ── POST → cria usuário ────────────────────────────────────
  if (req.method === 'POST') {
    const { nome, email, password, role, panels } = req.body || {}
    if (!email || !password) return res.status(400).json({ error: 'e-mail e senha são obrigatórios.' })

    // Cria no Auth (sem precisar de confirmação por e-mail)
    const { data: { user }, error: createError } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,       // confirma imediatamente
      user_metadata: { nome },
    })
    if (createError) return res.status(400).json({ error: createError.message })

    // Cria perfil
    await supa.from('profiles').upsert({
      id: user.id, email, nome: nome || '', role: role || 'user',
    })

    // Cria painéis
    if (Array.isArray(panels) && panels.length > 0) {
      await supa.from('user_panels').insert(panels.map(p => ({ user_id: user.id, panel: p })))
    }

    return res.status(201).json({ id: user.id, email, nome, role, panels })
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
