import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './UsersPage.module.css'

const PANELS = [
  { slug: 'financas', label: 'Luniq Finanças', icon: '💰' },
  { slug: 'aulas',   label: 'Gestão de Aulas', icon: '🎓' },
  { slug: 'brand',   label: 'Brand Studio',    icon: '🎨' },
]

const ROLES = [
  { value: 'user',  label: 'Usuário' },
  { value: 'admin', label: 'Administrador' },
]

const EMPTY_FORM = { nome: '', email: '', password: '', role: 'user', panels: [] }

// Detecta a base URL da API (mesma origin em produção, localhost em dev)
const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3000'

async function apiRequest(path, method, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || `Erro ${res.status}`)
  return json
}

export default function UsersPage() {
  const { user, profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [modal, setModal]           = useState(null)   // null | 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [deleting, setDeleting]     = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  // Redireciona não-admin
  useEffect(() => {
    if (profile && profile.role !== 'admin') navigate('/dashboard')
  }, [profile, navigate])

  useEffect(() => { loadUsers() }, [])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }

  async function loadUsers() {
    setLoading(true)
    try {
      const token = await getToken()
      const data = await apiRequest('/api/admin/users', 'GET', null, token)
      // Ordena por nome
      data.sort((a, b) => (a.nome || a.email).localeCompare(b.nome || b.email))
      setUsers(data)
    } catch (err) {
      console.error('Erro ao carregar usuários:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Criar usuário ──────────────────────────────────────────────
  function openCreate() {
    setForm(EMPTY_FORM)
    setError('')
    setSuccess('')
    setModal('create')
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const token = await getToken()
      await apiRequest('/api/admin/users', 'POST', {
        nome:     form.nome,
        email:    form.email,
        password: form.password,
        role:     form.role,
        panels:   form.panels,
      }, token)

      setSuccess(`Usuário ${form.email} criado com sucesso!`)
      setModal(null)
      loadUsers()
    } catch (err) {
      setError(err.message || 'Erro ao criar usuário.')
    } finally {
      setSaving(false)
    }
  }

  // ── Editar usuário ─────────────────────────────────────────────
  function openEdit(u) {
    setEditTarget(u)
    setForm({ nome: u.nome || '', email: u.email, password: '', role: u.role || 'user', panels: u.panels || [] })
    setError('')
    setSuccess('')
    setModal('edit')
  }

  async function handleEdit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const token = await getToken()
      const body = {
        nome:   form.nome,
        role:   form.role,
        panels: form.panels,
      }
      if (form.password) body.password = form.password

      await apiRequest(`/api/admin/users/${editTarget.id}`, 'PATCH', body, token)

      setSuccess(`Usuário ${form.email} atualizado.`)
      setModal(null)
      loadUsers()
    } catch (err) {
      setError(err.message || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  // ── Deletar usuário ────────────────────────────────────────────
  async function handleDelete() {
    if (!editTarget) return
    if (!window.confirm(`Tem certeza que deseja remover ${editTarget.email}? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)
    setError('')
    try {
      const token = await getToken()
      await apiRequest(`/api/admin/users/${editTarget.id}`, 'DELETE', null, token)
      setSuccess(`Usuário ${editTarget.email} removido.`)
      setModal(null)
      loadUsers()
    } catch (err) {
      setError(err.message || 'Erro ao remover usuário.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Helpers de formulário ──────────────────────────────────────
  function togglePanel(slug) {
    setForm(f => ({
      ...f,
      panels: f.panels.includes(slug)
        ? f.panels.filter(p => p !== slug)
        : [...f.panels, slug],
    }))
  }

  function closeModal() { setModal(null); setError('') }

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>← Hub</button>
          <span className={styles.title}>Gerenciar Usuários</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.userEmail}>{user?.email}</span>
          <span className={styles.badge}>Admin</span>
          <button className={styles.signOutBtn} onClick={signOut}>Sair</button>
        </div>
      </header>

      <main className={styles.main}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <p className={styles.eyebrow}>Gestão de acesso</p>
            <h2 className={styles.sectionTitle}>Usuários</h2>
            <p className={styles.sectionSub}>{users.length} usuário{users.length !== 1 ? 's' : ''} cadastrado{users.length !== 1 ? 's' : ''}</p>
          </div>
          <button className={styles.createBtn} onClick={openCreate}>+ Novo usuário</button>
        </div>

        {/* Feedback global */}
        {success && (
          <div className={styles.successBanner}>
            {success}
            <button onClick={() => setSuccess('')}>×</button>
          </div>
        )}

        {/* Tabela */}
        {loading ? (
          <div className={styles.loading}>Carregando…</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Painéis</th>
                  <th>Último acesso</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.nome || <span className={styles.muted}>—</span>}</td>
                    <td className={styles.email}>{u.email}</td>
                    <td>
                      <span className={u.role === 'admin' ? styles.roleAdmin : styles.roleUser}>
                        {u.role === 'admin' ? 'Admin' : 'Usuário'}
                      </span>
                    </td>
                    <td>
                      {u.role === 'admin' ? (
                        <span className={styles.muted}>Todos</span>
                      ) : u.panels.length === 0 ? (
                        <span className={styles.muted}>Nenhum</span>
                      ) : (
                        <div className={styles.panelTags}>
                          {u.panels.map(p => {
                            const info = PANELS.find(x => x.slug === p)
                            return (
                              <span key={p} className={styles.panelTag}>
                                {info?.icon} {info?.label || p}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </td>
                    <td className={styles.muted}>
                      {u.last_sign_in
                        ? new Date(u.last_sign_in).toLocaleDateString('pt-BR')
                        : '—'}
                    </td>
                    <td>
                      <button className={styles.editBtn} onClick={() => openEdit(u)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modal */}
      {modal && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{modal === 'create' ? 'Novo usuário' : `Editar · ${editTarget?.email}`}</h3>
              <button className={styles.closeBtn} onClick={closeModal}>×</button>
            </div>

            <form onSubmit={modal === 'create' ? handleCreate : handleEdit}>
              <div className={styles.fields}>

                <label className={styles.label}>
                  Nome
                  <input
                    className={styles.input}
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Nome completo"
                    required
                  />
                </label>

                {modal === 'create' ? (
                  <>
                    <label className={styles.label}>
                      E-mail
                      <input
                        className={styles.input}
                        type="email"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        placeholder="email@empresa.com"
                        required
                      />
                    </label>

                    <label className={styles.label}>
                      Senha temporária
                      <input
                        className={styles.input}
                        type="password"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        placeholder="Mínimo 6 caracteres"
                        minLength={6}
                        required
                      />
                    </label>
                  </>
                ) : (
                  <label className={styles.label}>
                    Nova senha (opcional)
                    <input
                      className={styles.input}
                      type="password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Deixe em branco para não alterar"
                      minLength={6}
                    />
                  </label>
                )}

                <label className={styles.label}>
                  Perfil de acesso
                  <select
                    className={styles.select}
                    value={form.role}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </label>

                {form.role !== 'admin' && (
                  <div className={styles.panelsField}>
                    <span className={styles.label}>Painéis liberados</span>
                    <div className={styles.panelOptions}>
                      {PANELS.map(p => (
                        <label key={p.slug} className={styles.checkRow}>
                          <input
                            type="checkbox"
                            checked={form.panels.includes(p.slug)}
                            onChange={() => togglePanel(p.slug)}
                          />
                          <span>{p.icon} {p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && <p className={styles.errorMsg}>{error}</p>}

              <div className={styles.modalFooter}>
                {modal === 'edit' && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={handleDelete}
                    disabled={deleting || saving}
                  >
                    {deleting ? 'Removendo…' : 'Remover'}
                  </button>
                )}
                <button type="button" className={styles.cancelBtn} onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className={styles.saveBtn} disabled={saving || deleting}>
                  {saving ? 'Salvando…' : modal === 'create' ? 'Criar usuário' : 'Salvar alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
