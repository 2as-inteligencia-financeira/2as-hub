/**
 * api/painel-credentials/[slug].js
 *
 * Retorna as credenciais Basic Auth de um painel que usa esse esquema (ex: direcao).
 * Credenciais ficam em variáveis de ambiente server-side (nunca em VITE_*).
 *
 * Fluxo:
 *   1. Painel recebe painel:token do hub (JWT Supabase)
 *   2. Painel chama GET /api/painel-credentials/<slug> com Authorization: Bearer <token>
 *   3. Esta rota valida o JWT e retorna { user, password }
 *   4. Painel chama saveAuth() e acessa sem formulário de login
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

// Origens dos painéis autorizados a buscar credenciais
const ALLOWED_ORIGINS = [
  'https://painel-direcaoconcursos.vercel.app',
  'https://direcao.2asfinancas.com',
  'https://granatum-cancelamentos-2as-financas.vercel.app',
  'https://cancelamentos.2asfinancas.com',
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:4173',
  ] : []),
]

// Credenciais server-side por slug (NUNCA usar VITE_ prefix aqui)
const CREDENTIALS = {
  direcao: {
    user:     process.env.DIRECAO_BASIC_AUTH_USER,
    password: process.env.DIRECAO_BASIC_AUTH_PASSWORD,
  },
  cancelamentos: {
    user:     process.env.CANCELAMENTOS_BASIC_AUTH_USER,
    password: process.env.CANCELAMENTOS_BASIC_AUTH_PASSWORD,
  },
}

async function verifyUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const supa = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error } = await supa.auth.getUser(token)
  return !error && user ? { ...user, _token: token } : null
}

async function hasPanelAccess(userId, slug, accessToken) {
  // Usa o JWT do usuário para que a RLS consiga ver o perfil/permissões corretas
  const supa = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

  const { data: profile } = await supa
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (profile?.role === 'admin') return true

  const { data: userPanel } = await supa
    .from('user_panels')
    .select('panel')
    .eq('user_id', userId)
    .eq('panel', slug)
    .maybeSingle()

  return !!userPanel
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  const isAllowedOrigin = !!origin && ALLOWED_ORIGINS.includes(origin)
  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')
  if (!isAllowedOrigin) return res.status(403).json({ error: 'Origem não permitida.' })
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' })

  const user = await verifyUser(req.headers.authorization)
  if (!user) return res.status(403).json({ error: 'Acesso negado.' })

  const { slug } = req.query
  const creds = CREDENTIALS[slug]
  if (!creds?.user || !creds?.password) {
    return res.status(404).json({ error: 'Credenciais não configuradas.' })
  }
  const hasAccess = await hasPanelAccess(user.id, slug, user._token)
  if (!hasAccess) return res.status(403).json({ error: 'Sem permissão para este painel.' })

  return res.status(200).json({ user: creds.user, password: creds.password })
}
