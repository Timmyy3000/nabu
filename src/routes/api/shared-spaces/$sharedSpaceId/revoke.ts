import { createFileRoute } from '@tanstack/react-router'
import { getSharedSpaceService, requireSharedSpaceOwner, sharedSpaceErrorResponse } from '../../../../lib/shared-spaces/http'

export const Route = createFileRoute('/api/shared-spaces/$sharedSpaceId/revoke')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireSharedSpaceOwner(request)
        if (auth.response) {
          return auth.response
        }

        try {
          const space = await getSharedSpaceService(request).revokeSharedSpace({
            ownerPrincipalId: auth.principal!.principalId,
            sharedSpaceId: params.sharedSpaceId,
          })
          return Response.json(space)
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },
    },
  },
})

