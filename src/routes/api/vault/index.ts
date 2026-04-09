import { createFileRoute } from '@tanstack/react-router'
import { getVaultIndexResponse } from '../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/')({
  server: {
    handlers: {
      GET: async () => getVaultIndexResponse(),
    },
  },
})
