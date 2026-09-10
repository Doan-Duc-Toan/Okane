import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { NotFoundPage } from './not-found-page'
import { ProtectedRoute } from './protected-route'
import { RoutePlaceholder } from './route-placeholder'

// All routes are declared here (Phase 6). Each subsequent UI phase swaps its
// own placeholder element(s) for the real page — an append/replace, never a
// restructure — which is what keeps Phases 7/8/9 parallel-safe.
export const router = createBrowserRouter([
  // auth routes (Phase 7)
  { path: '/login', element: <RoutePlaceholder label="Login" /> },
  { path: '/register', element: <RoutePlaceholder label="Register" /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          // goals routes (Phase 8)
          { path: '/', element: <RoutePlaceholder label="Dashboard" /> },
          { path: '/goals/new', element: <RoutePlaceholder label="New Goal" /> },
          { path: '/goals/:id', element: <RoutePlaceholder label="Goal Detail" /> },
          // exchange routes (Phase 9)
          { path: '/exchange', element: <RoutePlaceholder label="Exchange & Convert" /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
