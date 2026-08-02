import { createFileRoute } from '@tanstack/react-router'
import { renderAgentsMarkdown } from '../pages/agents'

export const Route = createFileRoute('/agents.md')({
  server: {
    handlers: {
      GET: async () => {
        const body = renderAgentsMarkdown()
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
