import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

function sanitizeRedirectPath(redirectTo: string | null | undefined): string {
  if (!redirectTo) {
    return '/'
  }

  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return '/'
  }

  return redirectTo
}

const getAuthStatus = createServerFn({ method: 'GET' }).handler(async ({ request }) => {
  const { isAuthenticatedRequest } = await import('../lib/auth/session')
  return {
    authenticated: isAuthenticatedRequest(request),
  }
})

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ search }) => {
    const auth = await getAuthStatus()
    if (auth.authenticated) {
      throw redirect({
        to: sanitizeRedirectPath(typeof search.redirect === 'string' ? search.redirect : '/'),
      })
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : '',
    error: typeof search.error === 'string' ? search.error : '',
  }),
  component: LoginRoute,
})

function LoginRoute() {
  const { redirect, error } = Route.useSearch()
  const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'

  return (
    <section className="auth-card panel">
      <p className="eyebrow">Nabu</p>
      <h1>Sign in</h1>
      <p className="muted">Enter the shared password to open the vault.</p>
      {error === '1' ? <p className="auth-error">Wrong password.</p> : null}
      <form method="post" action="/api/auth/login" className="auth-form">
        <input type="hidden" name="redirect" value={safeRedirect} />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit">Login</button>
      </form>
    </section>
  )
}
