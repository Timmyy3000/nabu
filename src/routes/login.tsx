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

export function LoginPage({ redirect, error }: { redirect: string; error: string }) {
  const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'

  return (
    <section className="route-page route-page-center">
      <article className="auth-surface">
        <div className="wordmark auth-wordmark" aria-label="𒀭 nabu">
          <span className="wedge">𒀭</span>
          <span className="wordmark-text">nabu</span>
        </div>
        <p className="section-label">private vault</p>
        <h1>sign in</h1>
        <p className="auth-copy">Enter the shared password to open the vault.</p>
        {error === '1' ? <p className="auth-error">Wrong password.</p> : null}
        <form method="post" action="/api/auth/login" className="auth-form">
          <input type="hidden" name="redirect" value={safeRedirect} />
          <div className="auth-field">
            <label htmlFor="password">password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button type="submit" className="ui-button">
            login
          </button>
        </form>
      </article>
    </section>
  )
}

function LoginRoute() {
  const { redirect, error } = Route.useSearch()
  return <LoginPage redirect={redirect} error={error} />
}
