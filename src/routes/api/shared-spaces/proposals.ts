import { createFileRoute } from '@tanstack/react-router'
import {
  getSharedSpaceService,
  readJsonBody,
  requireSharedSpaceOwner,
  sharedSpaceErrorResponse,
} from '../../../lib/shared-spaces/http'

export const Route = createFileRoute('/api/shared-spaces/proposals')({
  server: {
    handlers: {
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
          const proposal = await getSharedSpaceService(request).proposeSharedSpace({
            ownerPrincipalId: auth.principal!.principalId,
            path: typeof body.path === 'string' ? body.path : null,
            durationDays: typeof body.durationDays === 'number' ? body.durationDays : null,
          })
          return Response.json(proposal, { status: 201 })
        } catch (error) {
          return sharedSpaceErrorResponse(error)
        }
      },
    },
  },
})
