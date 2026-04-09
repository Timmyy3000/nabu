import { createFileRoute } from '@tanstack/react-router'
import { getVaultNoteBySlugResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/$slug')({
  server: {
    handlers: {
      GET: async ({ params }) => getVaultNoteBySlugResponse(params.slug),
    },
  },
})
