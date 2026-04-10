import { createFileRoute } from '@tanstack/react-router'
import { getVaultIndexStatsResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/index/stats')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        return getVaultIndexStatsResponse()
      },
    },
  },
})
