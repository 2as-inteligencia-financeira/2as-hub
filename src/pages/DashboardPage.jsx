import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './DashboardPage.module.css'

const ALL_PANELS = [
  {
    slug: 'financas',
    label: '2AS Finanças',
    description: 'DRE, fluxo de caixa, margens e indicadores em tempo real',
    num: 'Painel 01',
    url: import.meta.env.VITE_URL_FINANCAS || '#',
    color: '#f59e0b',
  },
  {
    slug: 'aulas',
    label: 'Gestão de Aulas',
    description: 'Professores, turmas, agendamentos e orçamentos',
    num: 'Painel 02',
    url: import.meta.env.VITE_URL_AULAS || '#',
    color: '#2fb7c6',
  },
  {
    slug: 'brand',
    label: 'Brand Studio',
    description: 'Identidade visual, logos e apresentações',
    num: 'Painel 03',
    url: import.meta.env.VITE_URL_BRAND || '#',
    color: '#22c55e',
  },
  {
    slug: 'direcao',
    label: 'Direção Concursos',
    description: 'DRE, fluxo de caixa, operações e gestão acadêmica',
    num: 'Painel 04',
    url: import.meta.env.VITE_URL_DIRECAO || 'https://painel-direcaoconcursos.vercel.app',
    color: '#ff6600',
  },
  {
    slug: 'cancelamentos',
    label: 'Direção Concursos - Cancelamentos',
    description: 'Radar de cancelamentos, lançamentos e gestão de contratos',
    num: 'Painel 05',
    url: import.meta.env.VITE_URL_CANCELAMENTOS || '#',
    color: '#8b5cf6',
  },
]

// Origens autorizadas a receber token via postMessage.
// Ao trocar domínio, manter uma lista fixa costuma quebrar (a origem real muda).
// Aqui derivamos as origens a partir das URLs configuradas via VITE_URL_*.
const TRUSTED_PANEL_ORIGINS = [
  ...(() => {
    const origins = new Set()
    for (const panel of ALL_PANELS) {
      if (!panel?.url || panel.url === '#') continue
      try {
        origins.add(new URL(panel.url).origin)
      } catch {
        // Ignora URLs inválidas/placeholder
      }
    }
    return [...origins]
  })(),
  ...(import.meta.env.DEV ? [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:4173',
  ] : []),
]

export default function DashboardPage() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [allowedPanels, setAllowedPanels] = useState([])
  const [loading, setLoading] = useState(true)
  // Mantém referência para cleanup dos listeners de postMessage
  const listenersRef = useRef([])

  useEffect(() => {
    async function loadPanels() {
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (prof?.role === 'admin') {
        setAllowedPanels(ALL_PANELS)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('user_panels')
        .select('panel')
        .eq('user_id', user.id)

      const slugs = new Set((data || []).map(r => r.panel))
      setAllowedPanels(ALL_PANELS.filter(p => slugs.has(p.slug)))
      setLoading(false)
    }

    if (user) loadPanels()
  }, [user])

  // Cleanup de todos os listeners ao desmontar
  useEffect(() => {
    return () => {
      listenersRef.current.forEach(({ handler, timeout }) => {
        window.removeEventListener('message', handler)
        clearTimeout(timeout)
      })
    }
  }, [])

  // Fix 1: abre painel e entrega token via postMessage, nunca via URL
  function openPanel(panel) {
    if (panel.url === '#') return

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return

      // IMPORTANTE: registrar o listener *antes* de window.open().
      // Se o painel carregar do cache e postar painel:ready rápido, eventos perdidos causam loop de login.
      let win = null

      const handler = (event) => {
        // Verifica se a origem é confiável
        if (!TRUSTED_PANEL_ORIGINS.includes(event.origin)) return
        if (event.data?.type !== 'painel:ready') return

        // Envia token apenas para a origem que mandou o ping
        if (!win || win.closed) return
        win.postMessage(
          {
            type:          'painel:token',
            access_token:  session.access_token,
            refresh_token: session.refresh_token,
          },
          event.origin // restringe o destino à origem exata do painel
        )

        cleanup()
      }

      // Timeout de segurança: remove o listener após 30s mesmo sem resposta
      const timeout = setTimeout(cleanup, 30_000)

      function cleanup() {
        window.removeEventListener('message', handler)
        clearTimeout(timeout)
        listenersRef.current = listenersRef.current.filter(l => l.handler !== handler)
      }

      window.addEventListener('message', handler)
      listenersRef.current.push({ handler, timeout })

      // Abre a janela — sem nenhum token na URL
      win = window.open(panel.url, '_blank')
      if (!win) {
        cleanup()
        return
      }
    })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.logo}>
            <span className={styles.logoL}>2</span>
            <span className={styles.logoU}>AS</span>
          </div>
          <div className={styles.headerSep} />
          <span className={styles.headerLabel}>Hub de painéis</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userEmail}>{user?.email}</span>
          {profile?.role === 'admin' && (
            <>
              <span className={styles.badge}>Admin</span>
              <button className={styles.adminBtn} onClick={() => navigate('/users')}>
                Usuários
              </button>
            </>
          )}
          <button className={styles.signOutBtn} onClick={signOut}>
            Sair
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.welcome}>
          <p className={styles.welcomeEyebrow}>2AS Inteligência Financeira</p>
          <h1>Olá{profile?.nome ? `, ${profile.nome.split(' ')[0]}` : ''}.</h1>
          <p>Selecione o painel que deseja acessar</p>
        </div>

        {loading ? (
          <div className={styles.loading}>Carregando painéis…</div>
        ) : allowedPanels.length === 0 ? (
          <div className={styles.empty}>
            <p>Nenhum painel liberado para sua conta.</p>
            <p>Entre em contato com o administrador.</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {allowedPanels.map(panel => (
              <button
                key={panel.slug}
                className={styles.card}
                onClick={() => openPanel(panel)}
                style={{ '--accent': panel.color }}
              >
                <div className={styles.cardTop}>
                  <span className={styles.cardNum}>{panel.num}</span>
                  <span className={styles.cardArrow}>→</span>
                </div>
                <div className={styles.cardBody}>
                  <h2 className={styles.cardTitle}>{panel.label}</h2>
                  <p className={styles.cardDesc}>{panel.description}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
