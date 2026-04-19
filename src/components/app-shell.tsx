import { Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

type ThemeName = 'scribe' | 'graphite'

const STORAGE_KEY = 'nabu-theme'
const THEMES: ThemeName[] = ['scribe', 'graphite']

function readInitialTheme(): ThemeName {
  if (typeof window === 'undefined') {
    return 'scribe'
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'graphite' ? 'graphite' : 'scribe'
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
  window.localStorage.setItem(STORAGE_KEY, theme)
}

function ThemePanel() {
  const [theme, setTheme] = useState<ThemeName>(readInitialTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <aside className="tweaks-panel" aria-label="theme switcher">
      <p className="section-label tweaks-label">theme</p>
      <div className="theme-switcher">
        {THEMES.map((nextTheme) => (
          <button
            key={nextTheme}
            type="button"
            className={theme === nextTheme ? 'theme-button is-active' : 'theme-button'}
            onClick={() => setTheme(nextTheme)}
          >
            {nextTheme}
          </button>
        ))}
      </div>
    </aside>
  )
}

export function AppShell() {
  return (
    <main className="app-shell">
      <Outlet />
      <ThemePanel />
    </main>
  )
}
