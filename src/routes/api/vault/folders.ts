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
        const { requireVaultPrincipal } = await import('../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        const url = new URL(request.url)
        return getVaultFolderListingResponse(url.searchParams.get('path'), auth.principal ?? undefined)
      },
      POST: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
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
        return createVaultFolderResponse({ path: payload.path ?? null, principal: auth.principal ?? undefined })
      },
      DELETE: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        const url = new URL(request.url)
        return deleteVaultFolderResponse({ path: url.searchParams.get('path'), principal: auth.principal ?? undefined })
      },
    },
  },
})
