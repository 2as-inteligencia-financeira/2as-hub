import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL  || process.env.VITE_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function verifyAdmin(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice(7)
  const supa = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error } = await supa.auth.getUser(token)
  if (error || !user) return false
  const { data: profile } = await supa
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return profile?.role === 'admin'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (!SERVICE_KEY) {
    return res.status(503).json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurado no servidor.' })
  }

  const isAdmin = await verifyAdmin(req.headers.authorization)
  if (!isAdmin) return res.status(403).json({ error: 'Acesso negado.' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'ID do usuário é obrigatório.' })

  const supa = adminClient()

  // ── PATCH → atualiza nome, role, senha e painéis ───────────────
  if (req.method === 'PATCH') {
    const { nome, role, panels, password } = req.body || {}

    // Atualiza no Auth (senha, se fornecida)
    if (password) {
      const { error: authError } = await supa.auth.admin.updateUserById(id, { password })
      if (authError) return res.status(400).json({ error: authError.message })
    }

    // Atualiza perfil
    const profileUpdate = {}
    if (nome  !== undefined) profileUpdate.nome = nome
    if (role  !== undefined) profileUpdate.role = role

    if (Object.keys(profileUpdate).length > 0) {
      const { error: profileError } = await supa
        .from('profiles')
        .update(profileUpdate)
        .eq('id', id)
      if (profileError) return res.status(400).json({ error: profileError.message })
    }

    // Recria painéis
    if (Array.isArray(panels)) {
      await supa.from('user_panels').delete().eq('user_id', id)
      if (panels.length > 0) {
        const rows = panels.map(p => ({ user_id: id, panel: p }))
        const { error: panelError } = await supa.from('user_panels').insert(rows)
        if (panelError) return res.status(400).json({ error: panelError.message })
      }
    }

    return res.status(200).json({ ok: true })
  }

  // ── DELETE → remove usuário completamente ─────────────────────
  if (req.method === 'DELETE') {
    // Remove painéis e perfil primeiro (FK)
    await supa.from('user_panels').delete().eq('user_id', id)
    await supa.from('profiles').delete().eq('id', id)

    // Remove do Auth
    const { error: deleteError } = await supa.auth.admin.deleteUser(id)
    if (deleteError) return res.status(400).json({ error: deleteError.message })

    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Método não permitido.' })
}
