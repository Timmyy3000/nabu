import { createFileRoute } from '@tanstack/react-router'
import { getAgentBootstrapContract } from '../../../lib/agent/bootstrap'

export const Route = createFileRoute('/api/agent/bootstrap')({
  server: {
    handlers: {
      GET: async () => Response.json(getAgentBootstrapContract()),
    },
  },
})
