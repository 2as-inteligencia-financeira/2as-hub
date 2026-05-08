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
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:4173',
  ] : []),
]

// Credenciais server-side por slug (NUNCA usar VITE_ prefix aqui)
const CREDENTIALS = {
  direcao: {
    user:     process.env.DIRECAO_BASIC_AUTH_USER,
    password: process.env.DIRECAO_BASIC_AUTH_PASSWORD,
  },
}

async function verifyUser(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return false
  const supa = createClient(SUPABASE_URL, ANON_KEY)
  const { data: { user }, error } = await supa.auth.getUser(authHeader.slice(7))
  return !error && !!user
}

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido.' })

  const isAuth = await verifyUser(req.headers.authorization)
  if (!isAuth) return res.status(403).json({ error: 'Acesso negado.' })

  const { slug } = req.query
  const creds = CREDENTIALS[slug]
  if (!creds?.user || !creds?.password) {
    return res.status(404).json({ error: 'Credenciais não configuradas.' })
  }

  return res.status(200).json({ user: creds.user, password: creds.password })
}
