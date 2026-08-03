import { createFileRoute } from '@tanstack/react-router'
import { getVaultSearchResponse } from '../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        const url = new URL(request.url)

        return getVaultSearchResponse({
          query: url.searchParams.get('q'),
          path: url.searchParams.get('path'),
          tag: url.searchParams.get('tag'),
          limit: url.searchParams.get('limit'),
          offset: url.searchParams.get('offset'),
          principal: auth.principal ?? undefined,
        })
      },
    },
  },
})
