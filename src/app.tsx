import { Outlet, Link, RouterProvider, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { HomePage } from './pages/home'

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

export function App() {
  return <RouterProvider router={router} />
}
