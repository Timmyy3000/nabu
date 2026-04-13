import { createFileRoute } from '@tanstack/react-router'
import { getVaultNoteNeighborhoodResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/neighborhood')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        const url = new URL(request.url)
        return getVaultNoteNeighborhoodResponse(url.searchParams.get('path'))
      },
    },
  },
})
