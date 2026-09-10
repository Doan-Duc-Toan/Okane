import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/spinner'

/** No session → redirect to /login, preserving the intended destination. */
export function ProtectedRoute() {
  const { status, sessionExpired } = useAuth()
  const location = useLocation()

  if (status === 'restoring') {
    return <Spinner />
  }

  if (status === 'guest') {
    const to = sessionExpired ? '/login?reason=expired' : '/login'
    return <Navigate to={to} replace state={{ from: location }} />
  }

  return <Outlet />
}
