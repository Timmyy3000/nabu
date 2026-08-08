import { createFileRoute } from '@tanstack/react-router'
import { createVaultNoteResponse } from '../../../../lib/vault/service'

export const Route = createFileRoute('/api/vault/notes/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireVaultPrincipal, toVaultWriteAuthorizationResponse } = await import('../../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        const writeAuthorization = toVaultWriteAuthorizationResponse(auth.principal)
        if (writeAuthorization) {
          return writeAuthorization
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

        if (
          typeof body === 'object' &&
          body !== null &&
          Object.prototype.hasOwnProperty.call(body, 'expectedContentHash')
        ) {
          return Response.json(
            {
              error: 'expectedContentHash is only supported for update and move requests',
            },
            { status: 400 },
          )
        }

        const payload = body as {
          path?: string | null
          rawMarkdown?: string | null
          document?: {
            title?: string | null
            summary?: string | null
            tags?: unknown
            authors?: unknown
            source?: string | null
            references?: unknown
            body?: string | null
          } | null
        }
        return createVaultNoteResponse({
          path: payload.path ?? null,
          rawMarkdown: payload.rawMarkdown ?? null,
          document: payload.document ?? null,
          principal: auth.principal ?? undefined,
        })
      },
    },
  },
})
