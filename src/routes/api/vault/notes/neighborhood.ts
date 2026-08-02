import { createFileRoute } from '@tanstack/react-router'
import { getVaultNoteNeighborhoodResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/neighborhood')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        const url = new URL(request.url)
        return getVaultNoteNeighborhoodResponse(url.searchParams.get('path'), auth.principal ?? undefined)
      },
    },
  },
})
