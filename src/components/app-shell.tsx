import { Outlet } from '@tanstack/react-router'

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Nabu</p>
          <h1>Markdown-native knowledge OS</h1>
          <p className="muted">A shared knowledge space for humans and agents.</p>
        </div>
        <nav className="nav-links">
          <a href="/" className="nav-link">Overview</a>
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
