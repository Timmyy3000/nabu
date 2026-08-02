import { hashSecret } from '../shared-spaces/crypto'
import { getSharedSpaceStore } from '../shared-spaces/store'
import type { SharedSpacePermission } from '../shared-spaces/types'
import { isAgentAuthenticatedRequest, isAuthenticatedRequest } from './session'

export const OWNER_PRINCIPAL_ID = 'owner'

export type VaultPrincipal =
  | {
      kind: 'owner'
      principalId: typeof OWNER_PRINCIPAL_ID
      permissions: ['read', 'write']
      rootPath: null
      sharedSpaceId: null
    }
  | {
      kind: 'shared'
      principalId: string
      permissions: SharedSpacePermission[]
      rootPath: string
      sharedSpaceId: string
      expiresAt: number
    }

export const OWNER_VAULT_PRINCIPAL: VaultPrincipal = {
  kind: 'owner',
  principalId: OWNER_PRINCIPAL_ID,
  permissions: ['read', 'write'],
  rootPath: null,
  sharedSpaceId: null,
}

export class VaultAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly code: 'VAULT_PATH_FORBIDDEN' | 'VAULT_WRITE_FORBIDDEN' = 'VAULT_PATH_FORBIDDEN',
    public readonly status = code === 'VAULT_WRITE_FORBIDDEN' ? 403 : 404,
  ) {
    super(message)
    this.name = 'VaultAuthorizationError'
  }
}

function extractBearerToken(request: Request): string | null {
  const value = request.headers.get('authorization')
  const match = value ? /^Bearer\s+(.+)$/i.exec(value.trim()) : null
  return match?.[1] ?? null
}

export async function resolveVaultPrincipal(request: Request, nowMs: number = Date.now()): Promise<VaultPrincipal | null> {
  if (isAuthenticatedRequest(request, nowMs) || isAgentAuthenticatedRequest(request)) {
    return OWNER_VAULT_PRINCIPAL
  }

  const bearerToken = extractBearerToken(request)
  if (!bearerToken) {
    return null
  }

  const store = await getSharedSpaceStore()
  const accessToken = store.findAccessToken(hashSecret(bearerToken), nowMs)
  if (!accessToken) {
    return null
  }

  store.touchAccessToken(accessToken.id, nowMs)
  return {
    kind: 'shared',
    principalId: accessToken.principalId,
    permissions: accessToken.permissions,
    rootPath: accessToken.rootPath,
    sharedSpaceId: accessToken.sharedSpaceId,
    expiresAt: Math.min(accessToken.expiresAt, accessToken.sharedSpaceExpiresAt),
  }
}

export async function requireVaultPrincipal(request: Request, nowMs: number = Date.now()): Promise<{
  principal: VaultPrincipal | null
  response: Response | null
}> {
  try {
    const principal = await resolveVaultPrincipal(request, nowMs)
    if (principal) {
      return { principal, response: null }
    }
  } catch {
    // Treat unavailable/invalid shared-token metadata as an authentication failure.
  }

  return {
    principal: null,
    response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
  }
}

export function isVaultPathInScope(principal: VaultPrincipal, normalizedPath: string): boolean {
  return principal.kind === 'owner' || normalizedPath === principal.rootPath || normalizedPath.startsWith(`${principal.rootPath}/`)
}

export function assertVaultPathAccess(
  principal: VaultPrincipal,
  normalizedPath: string,
  permission: 'read' | 'write' = 'read',
): void {
  if (!isVaultPathInScope(principal, normalizedPath)) {
    throw new VaultAuthorizationError('The requested vault resource is not available.')
  }

  if (permission === 'write' && !principal.permissions.includes('write')) {
    throw new VaultAuthorizationError('This shared space does not permit writes.', 'VAULT_WRITE_FORBIDDEN')
  }
}

