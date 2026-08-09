import { createFileRoute } from '@tanstack/react-router'
import { handleMcpRequest } from '../lib/mcp/http'

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      POST: ({ request }) => handleMcpRequest(request),
    },
  },
})
