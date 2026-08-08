import { createFileRoute } from '@tanstack/react-router'
import { getVaultAssetResponse } from '../../../lib/vault/assets'

export const Route = createFileRoute('/api/vault/assets')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        const url = new URL(request.url)
        return getVaultAssetResponse(url.searchParams.get('path'), auth.principal ?? undefined)
      },
    },
  },
})
