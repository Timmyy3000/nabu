import { createFileRoute } from '@tanstack/react-router'
import { getVaultSearchResponse } from '../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        const url = new URL(request.url)

        return getVaultSearchResponse({
          query: url.searchParams.get('q'),
          path: url.searchParams.get('path'),
          tag: url.searchParams.get('tag'),
          limit: url.searchParams.get('limit'),
          offset: url.searchParams.get('offset'),
        })
      },
    },
  },
})
