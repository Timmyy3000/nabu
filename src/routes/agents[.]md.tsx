import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AgentsPage } from '../pages/agents'

const getAuthStatus = createServerFn({ method: 'GET' }).handler(async ({ request }) => {
  const { isAuthenticatedRequest } = await import('../lib/auth/session')
  return {
    authenticated: isAuthenticatedRequest(request),
  }
})

export const Route = createFileRoute('/agents.md')({
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
  head: () => ({
    meta: [
      {
        title: 'Nabu /agents.md',
      },
      {
        name: 'description',
        content: 'Agent entrypoint for this Nabu instance: auth model, retrieval surfaces, and usage conventions.',
      },
    ],
  }),
  component: AgentsPage,
})
