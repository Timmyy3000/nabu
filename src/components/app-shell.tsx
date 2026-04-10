import { Outlet } from '@tanstack/react-router'

export function AppShell() {
  return (
    <main className="app-shell">
      <Outlet />
    </main>
  )
}
