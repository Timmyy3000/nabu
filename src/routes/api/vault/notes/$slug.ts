import { createFileRoute } from '@tanstack/react-router'
import { getVaultNoteBySlugResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/$slug')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { requireVaultPrincipal } = await import('../../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        return getVaultNoteBySlugResponse(params.slug, auth.principal ?? undefined)
      },
    },
  },
})
