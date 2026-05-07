import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * ProtectedRoute — bloqueia acesso a rotas autenticadas.
 *
 * Props:
 *   requiredRole?: 'admin' | 'user'
 *     Se definido, exige que o perfil tenha aquele role.
 *     Usuários autenticados sem o role são redirecionados para /dashboard.
 */
export default function ProtectedRoute({ children, requiredRole }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f0ea',
        color: '#999999',
        fontSize: 13,
        fontFamily: "'DM Mono', monospace",
        letterSpacing: '0.1em',
      }}>
        CARREGANDO…
      </div>
    )
  }

  // Não autenticado → login
  if (!user) return <Navigate to="/login" replace />

  // Role exigido mas perfil ainda carregando → aguarda
  if (requiredRole && profile === null) return null

  // Role exigido mas usuário não tem permissão → dashboard
  if (requiredRole && profile?.role !== requiredRole) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
