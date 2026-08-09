import { createFileRoute } from '@tanstack/react-router'
import { renderAgentsMarkdown } from '../pages/agents'
import { resolveCanonicalPublicUrl } from '../lib/shared-spaces/public-url'

export const Route = createFileRoute('/agents.md')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const body = renderAgentsMarkdown(resolveCanonicalPublicUrl({ requestUrl: request.url }))
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
