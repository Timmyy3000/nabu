import { createFileRoute } from '@tanstack/react-router'
import {
  deleteVaultNoteByPathResponse,
  getVaultNoteByPathResponse,
  moveVaultNoteByPathResponse,
  updateVaultNoteByPathResponse,
} from '../../../../lib/vault/service'
import { parseIfMatchHeader } from '../../../../lib/vault/revision'

export const Route = createFileRoute('/api/vault/notes/by-path')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        const url = new URL(request.url)
        return getVaultNoteByPathResponse(url.searchParams.get('path'), auth.principal ?? undefined)
      },
      PUT: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
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
          expectedContentHash?: string | null
          expectedRevision?: string | null
        }
        return updateVaultNoteByPathResponse({
          path: payload.path ?? null,
          rawMarkdown: payload.rawMarkdown ?? null,
          document: payload.document ?? null,
          expectedContentHash: payload.expectedContentHash ?? null,
          expectedRevision: payload.expectedRevision ?? parseIfMatchHeader(request.headers.get('if-match')),
          principal: auth.principal ?? undefined,
        })
      },
      PATCH: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
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

        const payload = body as {
          path?: string | null
          toPath?: string | null
          expectedContentHash?: string | null
          expectedRevision?: string | null
        }
        return moveVaultNoteByPathResponse({
          path: payload.path ?? null,
          toPath: payload.toPath ?? null,
          expectedContentHash: payload.expectedContentHash ?? null,
          expectedRevision: payload.expectedRevision ?? parseIfMatchHeader(request.headers.get('if-match')),
          principal: auth.principal ?? undefined,
        })
      },
      DELETE: async ({ request }) => {
        const { requireVaultPrincipal } = await import('../../../../lib/auth/authorization')
        const auth = await requireVaultPrincipal(request)
        if (auth.response) {
          return auth.response
        }

        const url = new URL(request.url)
        return deleteVaultNoteByPathResponse({
          path: url.searchParams.get('path'),
          principal: auth.principal ?? undefined,
        })
      },
    },
  },
})
