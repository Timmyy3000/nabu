import { createFileRoute } from '@tanstack/react-router'
import {
  getSharedSpaceService,
  readJsonBody,
  requireSharedSpaceOwner,
  sharedSpaceErrorResponse,
} from '../../../../lib/shared-spaces/http'

export const Route = createFileRoute('/api/shared-spaces/$sharedSpaceId/read-link')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireSharedSpaceOwner(request)
        if (auth.response) {
          return auth.response
        }

        const body = await readJsonBody(request)
        if (body instanceof Response) {
          return body
        }

        const hasDuration = Object.prototype.hasOwnProperty.call(body, 'durationDays')
        const durationDays = !hasDuration
          ? undefined
          : typeof body.durationDays === 'number'
            ? body.durationDays
            : Number.NaN

        try {
          const link = await getSharedSpaceService(request).issueReadLink({
            ownerPrincipalId: auth.principal!.principalId,
            sharedSpaceId: params.sharedSpaceId,
            durationDays,
            baseUrl: new URL(request.url).origin,
          })
          return Response.json(link, { status: 201 })
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },

      DELETE: async ({ request, params }) => {
        const auth = await requireSharedSpaceOwner(request)
        if (auth.response) {
          return auth.response
        }

        try {
          await getSharedSpaceService(request).revokeReadLink({
            ownerPrincipalId: auth.principal!.principalId,
            sharedSpaceId: params.sharedSpaceId,
          })
          return new Response(null, { status: 204 })
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },
    },
  },
})
