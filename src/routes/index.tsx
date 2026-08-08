import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getVaultBrowseData, searchVaultNotes } from '../lib/vault/service'
import { HomePage } from '../pages/home'

const getAuthStatus = createServerFn({ method: 'GET' })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const request = getRequest()
  const { isAuthenticatedRequest } = await import('../lib/auth/session')
  if (isAuthenticatedRequest(request)) {
    return {
      authenticated: true,
      owner: true,
    }
  }

  const { resolveVaultPrincipal } = await import('../lib/auth/authorization')
  const principal = await resolveVaultPrincipal(request, Date.now(), data.token)
  return {
    authenticated: principal != null,
    owner: false,
  }
})

const loadVaultBrowse = createServerFn({ method: 'GET' })
  .validator((input: { folder: string; note: string; token: string }) => input)
  .handler(async ({ data }) => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const request = getRequest()
    const { requireVaultPrincipal, toVaultAuthorizationResponse } = await import('../lib/auth/authorization')
    const auth = await requireVaultPrincipal(request, Date.now(), data.token)
    if (auth.response) {
      if (data.token) {
        return null
      }
      throw redirect({ to: '/login', search: { redirect: '/', error: '' } })
    }

    try {
      return JSON.parse(JSON.stringify(await getVaultBrowseData({
        folderPath: data.folder,
        noteSlug: data.note,
        principal: auth.principal ?? undefined,
      })))
    } catch (error) {
      const response = toVaultAuthorizationResponse(error)
      if (response) {
        if (data.token) {
          return null
        }
        throw response
      }
      throw error
    }
  })

const loadVaultSearch = createServerFn({ method: 'GET' })
  .validator((input: { q: string; searchPath: string; searchTag: string; token: string }) => input)
  .handler(async ({ data }) => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const request = getRequest()
    const { requireVaultPrincipal, toVaultAuthorizationResponse } = await import('../lib/auth/authorization')
    const auth = await requireVaultPrincipal(request, Date.now(), data.token)
    if (auth.response) {
      if (data.token) {
        return null
      }
      throw redirect({ to: '/login', search: { redirect: '/', error: '' } })
    }

    if (!data.q.trim()) {
      return null
    }

    try {
      return await searchVaultNotes({
        query: data.q,
        path: data.searchPath,
        tag: data.searchTag,
        principal: auth.principal ?? undefined,
      })
    } catch (error) {
      const response = toVaultAuthorizationResponse(error)
      if (response) {
        if (data.token) {
          return null
        }
        throw response
      }
      throw error
    }
  })

export const Route = createFileRoute('/')({
  beforeLoad: async ({ location }) => {
    const token = new URLSearchParams(location.searchStr).get('token') ?? ''
    const auth = await getAuthStatus({ data: { token } })

    if (auth.owner && token) {
      const cleanSearch = new URLSearchParams(location.searchStr)
      cleanSearch.delete('token')
      const query = cleanSearch.toString()
      throw redirect({ href: `${location.pathname}${query ? `?${query}` : ''}${location.hash}` })
    }

    if (!auth.authenticated && !token) {
      throw redirect({
        to: '/login',
        search: {
          redirect: `${location.pathname}${location.searchStr}${location.hash}`,
          error: '',
        },
      })
    }
  },
  validateSearch: (search: Record<string, unknown>): {
    folder: string
    note: string
    path?: string
    q: string
    searchPath: string
    searchTag: string
    token?: string
  } => ({
    folder: typeof search.folder === 'string' ? search.folder : '',
    note: typeof search.note === 'string' ? search.note : '',
    q: typeof search.q === 'string' ? search.q : '',
    searchPath: typeof search.searchPath === 'string' ? search.searchPath : '',
    searchTag: typeof search.searchTag === 'string' ? search.searchTag : '',
    ...(typeof search.path === 'string' && search.path ? { path: search.path } : {}),
    ...(typeof search.token === 'string' && search.token ? { token: search.token } : {}),
  }),
  loaderDeps: ({ search }) => ({
    folder: search.folder || search.path || '',
    note: search.note,
    q: search.q,
    searchPath: search.searchPath,
    searchTag: search.searchTag,
    token: search.token ?? '',
  }),
  loader: async ({ deps }) => {
    const auth = await getAuthStatus({ data: { token: deps.token } })
    if (!auth.authenticated) {
      return {
        browse: null,
        search: null,
        searchPathInput: deps.searchPath,
        searchTagInput: deps.searchTag,
        shareToken: deps.token,
        unavailable: true,
      }
    }

    const [browse, search] = await Promise.all([
      loadVaultBrowse({
        data: {
          folder: deps.folder,
          note: deps.note,
          token: deps.token,
        },
      }),
      loadVaultSearch({
        data: {
          q: deps.q,
          searchPath: deps.searchPath,
          searchTag: deps.searchTag,
          token: deps.token,
        },
      }),
    ])

    if (!browse) {
      return {
        browse: null,
        search: null,
        searchPathInput: deps.searchPath,
        searchTagInput: deps.searchTag,
        shareToken: deps.token,
        unavailable: true,
      }
    }

    return {
      browse,
      search,
      searchPathInput: deps.searchPath,
      searchTagInput: deps.searchTag,
      shareToken: deps.token,
      unavailable: false,
    }
  },
  headers: ({ match }) => match.search.token
    ? {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
      }
    : undefined,
  component: RouteComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()
  if (data.unavailable || !data.browse) {
    return (
      <main className="route-page">
        <section className="auth-surface" role="alert">
          <p className="section-label">shared space</p>
          <h1>Shared space unavailable</h1>
          <p className="auth-copy">This read-only link is expired, revoked, or does not include this path.</p>
        </section>
      </main>
    )
  }

  return (
    <HomePage
      browse={data.browse}
      search={data.search}
      searchPathInput={data.searchPathInput}
      searchTagInput={data.searchTagInput}
      shareToken={data.shareToken}
    />
  )
}
