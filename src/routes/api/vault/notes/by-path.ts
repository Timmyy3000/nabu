import { createFileRoute } from '@tanstack/react-router'
import { getVaultNoteByPathResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/by-path')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        const url = new URL(request.url)
        return getVaultNoteByPathResponse(url.searchParams.get('path'))
      },
    },
  },
})
