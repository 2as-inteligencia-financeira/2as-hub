import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './DashboardPage.module.css'

const ALL_PANELS = [
  {
    slug: 'financas',
    label: 'Luniq Finanças',
    description: 'Gestão financeira, DRE, fluxo de caixa e indicadores',
    icon: '📊',
    url: import.meta.env.VITE_URL_FINANCAS || '#',
    color: '#f59e0b',
  },
  {
    slug: 'aulas',
    label: 'Gestão de Aulas',
    description: 'Professores, turmas, agendamentos e orçamentos',
    icon: '🎓',
    url: import.meta.env.VITE_URL_AULAS || '#',
    color: '#2fb7c6',
  },
  {
    slug: 'brand',
    label: 'Brand Studio',
    description: 'Identidade visual, logos e apresentações',
    icon: '🎨',
    url: import.meta.env.VITE_URL_BRAND || '#',
    color: '#22c55e',
  },
]

export default function DashboardPage() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [allowedPanels, setAllowedPanels] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPanels() {
      if (!user) return

      // Busca perfil direto (ignora cache do context para garantir role atualizado)
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      // Admin vê tudo
      if (prof?.role === 'admin') {
        setAllowedPanels(ALL_PANELS)
        setLoading(false)
        return
      }

      // Busca painéis liberados para o usuário
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

  function openPanel(panel) {
    if (panel.url === '#') return
    // Passa o token Supabase via URL para o painel autenticar automaticamente
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const url = new URL(panel.url)
      url.searchParams.set('sb_access_token', session.access_token)
      url.searchParams.set('sb_refresh_token', session.refresh_token)
      window.open(url.toString(), '_blank')
    })
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <img src="/luniq-logo.svg" alt="Luniq" className={styles.logo} />
          <div className={styles.headerSep} />
          <span className={styles.headerLabel}>Hub de Painéis</span>
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
          <h1>Olá{profile?.nome ? `, ${profile.nome}` : ''} 👋</h1>
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
                <span className={styles.cardIcon}>{panel.icon}</span>
                <div className={styles.cardBody}>
                  <h2 className={styles.cardTitle}>{panel.label}</h2>
                  <p className={styles.cardDesc}>{panel.description}</p>
                </div>
                <span className={styles.cardArrow}>→</span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
