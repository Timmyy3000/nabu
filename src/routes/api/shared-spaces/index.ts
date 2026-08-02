import { createFileRoute } from '@tanstack/react-router'
import {
  getSharedSpaceService,
  readJsonBody,
  requireSharedSpaceOwner,
  sharedSpaceErrorResponse,
} from '../../../lib/shared-spaces/http'

export const Route = createFileRoute('/api/shared-spaces/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireSharedSpaceOwner(request)
        if (auth.response) {
          return auth.response
        }

        try {
          const spaces = await getSharedSpaceService(request).listSharedSpaces({
            ownerPrincipalId: auth.principal!.principalId,
          })
          return Response.json({ spaces })
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },
      POST: async ({ request }) => {
        const auth = await requireSharedSpaceOwner(request)
        if (auth.response) {
          return auth.response
        }

        const body = await readJsonBody(request)
        if (body instanceof Response) {
          return body
        }

        try {
          const result = await getSharedSpaceService(request).confirmSharedSpace({
            ownerPrincipalId: auth.principal!.principalId,
            proposalId: typeof body.proposalId === 'string' ? body.proposalId : '',
            confirmed: body.confirmed === true,
            durationDays: typeof body.durationDays === 'number' ? body.durationDays : null,
            permissions: Array.isArray(body.permissions) ? body.permissions as never[] : null,
            baseUrl: new URL(request.url).origin,
          })
          return Response.json(result, { status: 201 })
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },
    },
  },
})

