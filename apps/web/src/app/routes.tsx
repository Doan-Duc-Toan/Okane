import { Suspense, lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { Spinner } from '@/components/ui/spinner'
import { LoginPage } from '@/features/auth/login-page'
import { RegisterPage } from '@/features/auth/register-page'
import { DashboardPage } from '@/features/goals/dashboard-page'
import { GoalDetailPage } from '@/features/goals/goal-detail-page'
import { NewGoalPage } from '@/features/goals/new-goal-page'
import { NotFoundPage } from './not-found-page'
import { ProtectedRoute } from './protected-route'
import { PublicOnlyRoute } from './public-only-route'

// Recharts (~100KB+ gzipped, accepted cost for Phase 9's signature screen —
// see phase-09's Risk Assessment) is route-split so every other authenticated
// page's initial bundle stays free of it.
const ExchangePage = lazy(() =>
  import('@/features/exchange/exchange-page').then((m) => ({ default: m.ExchangePage })),
)

// All routes are declared here (Phase 6). Each subsequent UI phase swaps its
// own placeholder element(s) for the real page — an append/replace, never a
// restructure — which is what keeps Phases 7/8/9 parallel-safe.
export const router = createBrowserRouter([
  {
    // auth routes (Phase 7) — an authenticated user is bounced to '/'
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          // goals routes (Phase 8)
          { path: '/', element: <DashboardPage /> },
          { path: '/goals/new', element: <NewGoalPage /> },
          { path: '/goals/:id', element: <GoalDetailPage /> },
          // exchange routes (Phase 9)
          {
            path: '/exchange',
            element: (
              <Suspense fallback={<Spinner />}>
                <ExchangePage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
