import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/contexts/auth-context'
import { Spinner } from '@/components/ui/spinner'

/** An authenticated user cannot land on /login or /register — bounce to the dashboard. */
export function PublicOnlyRoute() {
  const { status } = useAuth()

  if (status === 'restoring') {
    return <Spinner />
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
