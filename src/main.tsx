import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRootRoute, createRoute, createRouter, Outlet, Link } from '@tanstack/react-router'
import './styles.css'
import { HomePage } from './pages/home'

const queryClient = new QueryClient()

function RootLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Nabu</p>
          <h1>Markdown-native knowledge OS</h1>
          <p className="muted">A shared knowledge space for humans and agents.</p>
        </div>
        <nav className="nav-links">
          <Link to="/" className="nav-link">Overview</Link>
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const routeTree = rootRoute.addChildren([indexRoute])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
