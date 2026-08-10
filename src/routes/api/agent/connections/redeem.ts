import { createFileRoute } from '@tanstack/react-router'
import {
  AgentConnectionService,
  agentConnectionErrorResponse,
} from '../../../../lib/auth/agent-connection'
import { resolveCanonicalPublicUrl } from '../../../../lib/shared-spaces/public-url'
import { readJsonBody } from '../../../../lib/shared-spaces/http'

const PRIVATE_HEADERS = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
}

export const Route = createFileRoute('/api/agent/connections/redeem')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJsonBody(request)
        if (body instanceof Response) {
          return body
        }

        if (typeof body.connectionUrl !== 'string' || !body.connectionUrl.trim()) {
          return Response.json(
            { error: 'The connectionUrl field is required.' },
            { status: 400, headers: PRIVATE_HEADERS },
          )
        }

        try {
          const result = await new AgentConnectionService({
            baseUrl: resolveCanonicalPublicUrl({ requestUrl: request.url }),
          }).redeemConnection({ connectionUrl: body.connectionUrl })
          return Response.json(result, { status: 200, headers: PRIVATE_HEADERS })
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
