import { createFileRoute } from '@tanstack/react-router'
import { createVaultNoteResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        let body: unknown

        try {
          body = await request.json()
        } catch {
          return Response.json(
            {
              error: 'Invalid request body',
            },
            { status: 400 },
          )
        }

        const payload = body as { path?: string | null; rawMarkdown?: string | null }
        return createVaultNoteResponse({
          path: payload.path ?? null,
          rawMarkdown: payload.rawMarkdown ?? null,
        })
      },
    },
  },
})
