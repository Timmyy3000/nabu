import { createFileRoute } from '@tanstack/react-router'
import { getVaultFolderListingResponse } from '../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/folders')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        return getVaultFolderListingResponse(url.searchParams.get('path'))
      },
    },
  },
})
