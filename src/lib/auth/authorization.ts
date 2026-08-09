import { hashSecret } from '../shared-spaces/crypto'
import { getSharedSpaceStore } from '../shared-spaces/store'
import type { SharedSpacePermission } from '../shared-spaces/types'
import { isAgentAuthenticatedRequest, isAuthenticatedRequest } from './session'

export const OWNER_PRINCIPAL_ID = 'owner'
export const PUBLIC_READ_LINK_PRINCIPAL_PREFIX = 'read-link:'

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

export function toVaultAuthorizationResponse(error: unknown): Response | null {
  if (!(error instanceof VaultAuthorizationError)) {
    return null
  }

  return Response.json({ error: error.message }, { status: error.status })
}

export function isPublicReadLinkPrincipal(principal: VaultPrincipal): boolean {
  return principal.kind === 'shared' && principal.principalId.startsWith(PUBLIC_READ_LINK_PRINCIPAL_PREFIX)
}

export function vaultPrincipalHeaders(
  principal: VaultPrincipal | null | undefined,
  headers?: HeadersInit,
): Headers {
  const result = new Headers(headers)
  if (principal && isPublicReadLinkPrincipal(principal)) {
    result.set('Cache-Control', 'private, no-store')
    result.set('Referrer-Policy', 'no-referrer')
  }
  return result
}

export function toVaultWriteAuthorizationResponse(principal: VaultPrincipal | null | undefined): Response | null {
  if (!principal || principal.kind === 'owner' || principal.permissions.includes('write')) {
    return null
  }

  return Response.json(
    { error: 'The requested vault resource is not available.' },
    { status: 403, headers: vaultPrincipalHeaders(principal) },
  )
}

function extractBearerToken(request: Request): string | null {
  const value = request.headers.get('authorization')
  const match = value ? /^Bearer\s+(.+)$/i.exec(value.trim()) : null
  return match?.[1] ?? null
}

export async function resolveVaultPrincipal(
  request: Request,
  nowMs: number = Date.now(),
  readLinkSecretOverride?: string | null,
): Promise<VaultPrincipal | null> {
  if (isAuthenticatedRequest(request, nowMs) || isAgentAuthenticatedRequest(request)) {
    return OWNER_VAULT_PRINCIPAL
  }

  const bearerToken = extractBearerToken(request)
  const readLinkSecret = readLinkSecretOverride ?? new URL(request.url).searchParams.get('token')
  if (!bearerToken && !readLinkSecret) {
    return null
  }

  const store = await getSharedSpaceStore()
  if (bearerToken) {
    const accessToken = store.findAccessToken(hashSecret(bearerToken), nowMs)
    if (accessToken) {
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
  }

  return resolvePublicReadLinkPrincipalFromStore(readLinkSecret, nowMs, store)
}

export async function resolvePublicReadLinkPrincipal(
  readLinkSecret: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<VaultPrincipal | null> {
  const store = await getSharedSpaceStore()
  return resolvePublicReadLinkPrincipalFromStore(readLinkSecret, nowMs, store)
}

function resolvePublicReadLinkPrincipalFromStore(
  readLinkSecret: string | null | undefined,
  nowMs: number,
  store: Awaited<ReturnType<typeof getSharedSpaceStore>>,
): VaultPrincipal | null {
  if (!readLinkSecret) {
    return null
  }

  const readLink = store.findReadLink(hashSecret(readLinkSecret), nowMs)
  if (!readLink) {
    return null
  }

  return {
    kind: 'shared',
    principalId: `${PUBLIC_READ_LINK_PRINCIPAL_PREFIX}${readLink.sharedSpaceId}`,
    permissions: ['read'],
    rootPath: readLink.rootPath,
    sharedSpaceId: readLink.sharedSpaceId,
    expiresAt: Math.min(readLink.expiresAt, readLink.sharedSpaceExpiresAt),
  }
}

export async function requireVaultPrincipal(
  request: Request,
  nowMs: number = Date.now(),
  readLinkSecretOverride?: string | null,
): Promise<{
  principal: VaultPrincipal | null
  response: Response | null
}> {
  try {
    const principal = await resolveVaultPrincipal(request, nowMs, readLinkSecretOverride)
    if (principal) {
      return { principal, response: null }
    }
  } catch {
    // Treat unavailable/invalid shared-token metadata as an authentication failure.
  }

  const tokenBearingRequest = Boolean(readLinkSecretOverride) || new URL(request.url).searchParams.has('token')
  return {
    principal: null,
    response: Response.json(
      { error: 'Unauthorized' },
      {
        status: 401,
        headers: tokenBearingRequest
          ? { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
          : undefined,
      },
    ),
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
