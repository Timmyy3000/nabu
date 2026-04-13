import { createFileRoute } from '@tanstack/react-router'
import { getVaultNoteByPathResponse, updateVaultNoteByPathResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/by-path')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireAuthenticatedApiRequest } = await import('../../../../lib/auth/session')
        const unauthorizedResponse = requireAuthenticatedApiRequest(request)
        if (unauthorizedResponse) {
          return unauthorizedResponse
        }

        const url = new URL(request.url)
        return getVaultNoteByPathResponse(url.searchParams.get('path'))
      },
      PUT: async ({ request }) => {
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
        return updateVaultNoteByPathResponse({
          path: payload.path ?? null,
          rawMarkdown: payload.rawMarkdown ?? null,
        })
      },
    },
  },
})
