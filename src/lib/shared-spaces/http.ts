import { requireVaultPrincipal, type VaultPrincipal } from '../auth/authorization'
import { SharedSpaceError, SharedSpaceService } from './service'
import { resolveCanonicalPublicUrl } from './public-url'

export async function requireSharedSpaceOwner(request: Request): Promise<{
  principal: VaultPrincipal | null
  response: Response | null
}> {
  const auth = await requireVaultPrincipal(request)
  if (auth.response) {
    return auth
  }

  if (auth.principal?.kind !== 'owner') {
    return {
      principal: null,
      response: Response.json({ error: 'Owner authorization is required.' }, { status: 403 }),
    }
  }

  return auth
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    return body as Record<string, unknown>
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export function sharedSpaceErrorResponse(error: unknown): Response {
  if (error instanceof SharedSpaceError) {
    const body = {
      error: error.message,
      code: error.code,
      ...(error.nextAction ? { nextAction: error.nextAction } : {}),
    }
    return Response.json(
      body,
      { status: error.status },
    )
  }

  return Response.json({ error: 'Shared-space operation failed.' }, { status: 500 })
}

export function getSharedSpaceService(request: Request): SharedSpaceService {
  return new SharedSpaceService({ baseUrl: resolveCanonicalPublicUrl({ requestUrl: request.url }) })
}
