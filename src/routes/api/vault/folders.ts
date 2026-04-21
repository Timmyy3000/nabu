import { createFileRoute } from '@tanstack/react-router'
import {
  createVaultFolderResponse,
  deleteVaultFolderResponse,
  getVaultFolderListingResponse,
} from '../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/folders')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        const url = new URL(request.url)
        return getVaultFolderListingResponse(url.searchParams.get('path'))
      },
      POST: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        let body: unknown

        try {
          body = await request.json()
        } catch {
          return Response.json(
            {
              error: 'Invalid request body',
            },
            { status: 400 },
          )
        }

        const payload = body as { path?: string | null }
        return createVaultFolderResponse({ path: payload.path ?? null })
      },
      DELETE: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        const url = new URL(request.url)
        return deleteVaultFolderResponse({ path: url.searchParams.get('path') })
      },
    },
  },
})
