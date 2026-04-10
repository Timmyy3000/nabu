import { createFileRoute } from '@tanstack/react-router'
import { getVaultTreeResponse } from '../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/tree')({
  server: {
    handlers: {
      GET: async () => getVaultTreeResponse(),
    },
  },
})
