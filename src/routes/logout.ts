import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/logout')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { buildLogoutResponse } = await import('../lib/auth/session')
        return buildLogoutResponse(request)
      },
    },
  },
})
