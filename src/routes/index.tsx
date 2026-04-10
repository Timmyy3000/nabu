import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getVaultBrowseData } from '../lib/vault/service'
import { HomePage } from '../pages/home'

const getAuthStatus = createServerFn({ method: 'GET' }).handler(async ({ request }) => {
  const { isAuthenticatedRequest } = await import('../lib/auth/session')
  return {
    authenticated: isAuthenticatedRequest(request),
  }
})

const loadVaultBrowse = createServerFn({ method: 'GET' })
  .inputValidator((input: { folder: string; note: string }) => input)
  .handler(async ({ data }) =>
    getVaultBrowseData({
      folderPath: data.folder,
      noteSlug: data.note,
    }),
  )

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
  }),
  loaderDeps: ({ search }) => ({
    folder: search.folder,
    note: search.note,
  }),
  loader: ({ deps }) => loadVaultBrowse({ data: deps }),
  component: RouteComponent,
})

function RouteComponent() {
  const browse = Route.useLoaderData()
  return <HomePage browse={browse} />
}
