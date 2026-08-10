import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AgentSettingsPage } from '../../pages/agent-settings'

const getAuthStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequest } = await import('@tanstack/react-start/server')
  const { isAuthenticatedRequest } = await import('../../lib/auth/session')
  return {
    authenticated: isAuthenticatedRequest(getRequest()),
  }
})

export const Route = createFileRoute('/settings/agents')({
  beforeLoad: async () => {
    const auth = await getAuthStatus()
    if (!auth.authenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: '/settings/agents', error: '' },
      })
    }
  },
  component: AgentSettingsRoute,
})

function AgentSettingsRoute() {
  return <AgentSettingsPage />
}
