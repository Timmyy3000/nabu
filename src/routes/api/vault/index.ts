import { createFileRoute } from '@tanstack/react-router'
import { getVaultIndexResponse } from '../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        return getVaultIndexResponse()
      },
    },
  },
})
