import { createFileRoute } from '@tanstack/react-router'
import { getSharedSpaceService, readJsonBody, sharedSpaceErrorResponse } from '../../../../lib/shared-spaces/http'

export const Route = createFileRoute('/api/shared-spaces/invites/redeem')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJsonBody(request)
        if (body instanceof Response) {
          return body
        }

        try {
          const result = await getSharedSpaceService(request).redeemSharedSpaceInvite({
            inviteUrl: typeof body.inviteUrl === 'string' ? body.inviteUrl : '',
          })
          return Response.json(result)
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },
    },
  },
})

