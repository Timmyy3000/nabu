import { createFileRoute } from '@tanstack/react-router'
import { getVaultIndexResponse } from '../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        return getVaultIndexResponse(auth.principal ?? undefined)
      },
    },
  },
})
