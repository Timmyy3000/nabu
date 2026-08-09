import { createFileRoute } from '@tanstack/react-router'
import { getSharedSpaceStore } from '../../lib/shared-spaces/store'
import { resolveCanonicalPublicUrl } from '../../lib/shared-spaces/public-url'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          resolveCanonicalPublicUrl()
          await getSharedSpaceStore()
          return Response.json({ status: 'ok', storage: 'ready' })
        } catch {
          return Response.json({ status: 'unready', storage: 'unavailable' }, { status: 503 })
        }
      },
    },
  },
})
