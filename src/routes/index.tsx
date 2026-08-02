import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getVaultBrowseData, searchVaultNotes } from '../lib/vault/service'
import { HomePage } from '../pages/home'

const getAuthStatus = createServerFn({ method: 'GET' }).handler(async ({ request }) => {
  const { isAuthenticatedRequest } = await import('../lib/auth/session')
  return {
    authenticated: isAuthenticatedRequest(request),
  }
})

const loadVaultBrowse = createServerFn({ method: 'GET' })
  .inputValidator((input: { folder: string; note: string }) => input)
  .handler(async ({ request, data }) => {
    const { requireVaultPrincipal } = await import('../lib/auth/authorization')
    const auth = await requireVaultPrincipal(request)
    if (auth.response) {
      throw redirect({ to: '/login' })
    }

    return getVaultBrowseData({
      folderPath: data.folder,
      noteSlug: data.note,
      principal: auth.principal ?? undefined,
    })
  })

const loadVaultSearch = createServerFn({ method: 'GET' })
  .inputValidator((input: { q: string; searchPath: string; searchTag: string }) => input)
  .handler(async ({ request, data }) => {
    const { requireVaultPrincipal } = await import('../lib/auth/authorization')
    const auth = await requireVaultPrincipal(request)
    if (auth.response) {
      throw redirect({ to: '/login' })
    }

    if (!data.q.trim()) {
      return null
    }

    return searchVaultNotes({
      query: data.q,
      path: data.searchPath,
      tag: data.searchTag,
      principal: auth.principal ?? undefined,
    })
  })

export const Route = createFileRoute('/')({
  beforeLoad: async ({ location }) => {
    const auth = await getAuthStatus()

    if (!auth.authenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: `${location.pathname}${location.searchStr}${location.hash}`,
        },
      })
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    folder: typeof search.folder === 'string' ? search.folder : '',
    note: typeof search.note === 'string' ? search.note : '',
    q: typeof search.q === 'string' ? search.q : '',
    searchPath: typeof search.searchPath === 'string' ? search.searchPath : '',
    searchTag: typeof search.searchTag === 'string' ? search.searchTag : '',
  }),
  loaderDeps: ({ search }) => ({
    folder: search.folder,
    note: search.note,
    q: search.q,
    searchPath: search.searchPath,
    searchTag: search.searchTag,
  }),
  loader: async ({ deps }) => {
    const [browse, search] = await Promise.all([
      loadVaultBrowse({
        data: {
          folder: deps.folder,
          note: deps.note,
        },
      }),
      loadVaultSearch({
        data: {
          q: deps.q,
          searchPath: deps.searchPath,
          searchTag: deps.searchTag,
        },
      }),
    ])

    return {
      browse,
      search,
      searchPathInput: deps.searchPath,
      searchTagInput: deps.searchTag,
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()
  return (
    <HomePage
      browse={data.browse}
      search={data.search}
      searchPathInput={data.searchPathInput}
      searchTagInput={data.searchTagInput}
    />
  )
}
