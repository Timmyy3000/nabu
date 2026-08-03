import { createFileRoute } from '@tanstack/react-router'
import { getVaultIndexStatsResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/index/stats')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        return getVaultIndexStatsResponse(auth.principal ?? undefined)
      },
    },
  },
})
