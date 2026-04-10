import { createFileRoute } from '@tanstack/react-router'
import { getVaultNoteBySlugResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/$slug')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        return getVaultNoteBySlugResponse(params.slug)
      },
    },
  },
})
