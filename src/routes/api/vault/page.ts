import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { resolvePublicReadLinkPrincipal, VaultAuthorizationError } from '../../../lib/auth/authorization'
import { getVaultBrowseData, searchVaultNotes } from '../../../lib/vault/service'

const privacyHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
}

const pageRequestSchema = z.object({
  token: z.string().min(20).max(512),
  folder: z.string().max(1_024),
  note: z.string().max(256),
  q: z.string().max(512),
  searchPath: z.string().max(1_024),
  searchTag: z.string().max(128),
}).strict()

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: privacyHeaders })
}

export const Route = createFileRoute('/api/vault/page')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let input: z.infer<typeof pageRequestSchema>
        try {
          const parsed = pageRequestSchema.safeParse(await request.json())
          if (!parsed.success) {
            return json({ error: 'Invalid request' }, 400)
          }
          input = parsed.data
        } catch {
          return json({ error: 'Invalid request' }, 400)
        }

        try {
          const principal = await resolvePublicReadLinkPrincipal(input.token)
          if (!principal) {
            return json({ error: 'Shared space unavailable' }, 401)
          }

          const browse = await getVaultBrowseData({
            folderPath: input.folder,
            noteSlug: input.note,
            principal,
          })
          const search = input.q.trim()
            ? await searchVaultNotes({
              query: input.q,
              path: input.searchPath,
              tag: input.searchTag,
              principal,
            })
            : null

          return json({ browse, search })
        } catch (error) {
          if (error instanceof VaultAuthorizationError) {
            return json({ error: 'Shared space unavailable' }, 404)
          }
          return json({ error: 'Shared space unavailable' }, 500)
        }
      },
    },
  },
})
