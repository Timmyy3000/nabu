import { createFileRoute } from '@tanstack/react-router'
import { renderAgentsMarkdown } from '../pages/agents'

export const Route = createFileRoute('/agents.md')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { resolveVaultPrincipal } = await import('../lib/auth/authorization')
        const body = renderAgentsMarkdown(Boolean(await resolveVaultPrincipal(request)), new URL(request.url).origin)
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
