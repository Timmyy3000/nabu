import { createFileRoute } from '@tanstack/react-router'
import { getSharedSpaceService, requireSharedSpaceOwner, sharedSpaceErrorResponse } from '../../../../lib/shared-spaces/http'

export const Route = createFileRoute('/api/shared-spaces/$sharedSpaceId/invites')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const auth = await requireSharedSpaceOwner(request)
        if (auth.response) {
          return auth.response
        }

        try {
          const invite = await getSharedSpaceService(request).createSharedSpaceInvite({
            ownerPrincipalId: auth.principal!.principalId,
            sharedSpaceId: params.sharedSpaceId,
          })
          return Response.json(invite, { status: 201 })
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },
    },
  },
})
