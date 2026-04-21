import { createFileRoute } from '@tanstack/react-router'
import { renderAgentsMarkdown } from '../pages/agents'

export const Route = createFileRoute('/agents.md')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isAuthenticatedRequest } = await import('../lib/auth/session')
        const body = renderAgentsMarkdown(isAuthenticatedRequest(request))
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
          },
        })
      },
    },
  },
})
