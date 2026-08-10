import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticatedRequest } from '../../../../lib/auth/session'
import {
  AgentConnectionService,
  agentConnectionErrorResponse,
} from '../../../../lib/auth/agent-connection'
import { resolveCanonicalPublicUrl } from '../../../../lib/shared-spaces/public-url'
import { readJsonBody } from '../../../../lib/shared-spaces/http'

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
}

export const Route = createFileRoute('/api/agent/connections/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticatedRequest(request)) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await readJsonBody(request)
        if (body instanceof Response) {
          return body
        }

        try {
          const result = await new AgentConnectionService({
            baseUrl: resolveCanonicalPublicUrl({ requestUrl: request.url }),
          }).issueConnection({
            ownerPrincipalId: 'owner',
            permissions: body.permissions,
          })
          return Response.json(result, { status: 201, headers: PRIVATE_HEADERS })
        } catch (error) {
          const response = agentConnectionErrorResponse(error)
          for (const [key, value] of Object.entries(PRIVATE_HEADERS)) {
            response.headers.set(key, value)
          }
          return response
        }
      },
    },
  },
})
