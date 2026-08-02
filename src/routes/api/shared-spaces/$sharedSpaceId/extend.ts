import { createFileRoute } from '@tanstack/react-router'
import {
  getSharedSpaceService,
  readJsonBody,
  requireSharedSpaceOwner,
  sharedSpaceErrorResponse,
} from '../../../../lib/shared-spaces/http'

export const Route = createFileRoute('/api/shared-spaces/$sharedSpaceId/extend')({
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

        try {
          const space = await getSharedSpaceService(request).extendSharedSpace({
            ownerPrincipalId: auth.principal!.principalId,
            sharedSpaceId: params.sharedSpaceId,
            durationDays: typeof body.durationDays === 'number' ? body.durationDays : 0,
            confirmed: body.confirmed === true,
          })
          return Response.json(space)
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },
    },
  },
})
