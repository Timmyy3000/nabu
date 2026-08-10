import { generateId, generateOpaqueSecret, hashSecret } from '../shared-spaces/crypto'
import { resolveCanonicalLink, resolveCanonicalPath, resolveCanonicalPublicUrl } from '../shared-spaces/public-url'
import { getSharedSpaceStore } from '../shared-spaces/store'
import type { SharedSpacePermission } from '../shared-spaces/types'

export const AGENT_CONNECTION_TTL_MS = 10 * 60 * 1_000

export type AgentConnectionRedemptionContract = {
  endpoint: string
  method: 'POST'
  bodyField: 'connectionUrl'
  expiresAt: string
  nextAction: 'redeem_and_save_credential'
}

export type AgentConnectionIssueResult = {
  connectionUrl: string
  permissions: SharedSpacePermission[]
  expiresAt: string
  redemption: AgentConnectionRedemptionContract
}

export type AgentConnectionRedemptionResult = {
  apiBaseUrl: string
  permissions: SharedSpacePermission[]
  credential: string
  createdAt: string
  nextAction: 'configure_agent'
}

export class AgentConnectionError extends Error {
  constructor(
    message: string,
    public readonly code: 'AGENT_CONNECTION_PERMISSIONS_INVALID' | 'AGENT_CONNECTION_INVALID',
    public readonly status: 400 | 410 = code === 'AGENT_CONNECTION_INVALID' ? 410 : 400,
  ) {
    super(message)
    this.name = 'AgentConnectionError'
  }
}

export function agentConnectionErrorResponse(error: unknown): Response {
  if (error instanceof AgentConnectionError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status })
  }

  return Response.json({ error: 'Agent connection operation failed.' }, { status: 500 })
}

export type AgentConnectionServiceOptions = {
  now?: () => number
  baseUrl?: string
}

export function normalizeAgentPermissions(value: unknown): SharedSpacePermission[] {
  if (!Array.isArray(value)) {
    throw new AgentConnectionError(
      'Agent permissions must include read and may include write.',
      'AGENT_CONNECTION_PERMISSIONS_INVALID',
    )
  }

  const requested = [...new Set(value)]
  if (
    requested.length === 0 ||
    !requested.includes('read') ||
    requested.some((permission) => permission !== 'read' && permission !== 'write')
  ) {
    throw new AgentConnectionError(
      'Agent permissions must include read and may include write.',
      'AGENT_CONNECTION_PERMISSIONS_INVALID',
    )
  }

  return (['read', 'write'] as const).filter((permission) => requested.includes(permission))
}

function iso(value: number): string {
  return new Date(value).toISOString()
}

function connectionUrl(baseUrl: string, secret: string): string {
  return resolveCanonicalLink(baseUrl, `/connect/agent/${encodeURIComponent(secret)}`).toString()
}

function redemptionContract(baseUrl: string, expiresAt: string): AgentConnectionRedemptionContract {
  return {
    endpoint: resolveCanonicalPath(baseUrl, '/api/agent/connections/redeem'),
    method: 'POST',
    bodyField: 'connectionUrl',
    expiresAt,
    nextAction: 'redeem_and_save_credential',
  }
}

function invalidConnection(): AgentConnectionError {
  return new AgentConnectionError('The agent connection is invalid or expired.', 'AGENT_CONNECTION_INVALID', 410)
}

function extractConnectionSecret(value: string): string {
  try {
    const url = new URL(value)
    if (url.search || url.hash) {
      throw new Error('connection URL must not include query or fragment')
    }

    const segments = url.pathname.split('/').filter(Boolean)
    const secret = segments.at(-1)
    if (segments.at(-3) !== 'connect' || segments.at(-2) !== 'agent' || !secret) {
      throw new Error('invalid connection path')
    }

    const decoded = decodeURIComponent(secret)
    if (!/^[A-Za-z0-9_-]+$/.test(decoded)) {
      throw new Error('invalid connection secret')
    }
    return decoded
  } catch {
    throw invalidConnection()
  }
}

export class AgentConnectionService {
  private readonly now: () => number
  private readonly baseUrl: string

  constructor(options: AgentConnectionServiceOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.baseUrl = resolveCanonicalPublicUrl({ configuredBaseUrl: options.baseUrl })
  }

  async issueConnection(input: {
    ownerPrincipalId: string
    permissions: unknown
  }): Promise<AgentConnectionIssueResult> {
    const permissions = normalizeAgentPermissions(input.permissions)
    const now = this.now()
    const secret = generateOpaqueSecret()
    const expiresAt = now + AGENT_CONNECTION_TTL_MS
    const store = await getSharedSpaceStore()

    store.createOwnerAgentConnection({
      id: generateId('agent-connection'),
      ownerPrincipalId: input.ownerPrincipalId,
      tokenHash: hashSecret(secret),
      permissions,
      createdAt: now,
      expiresAt,
      consumedAt: null,
      credentialId: null,
    })

    const expiresAtIso = iso(expiresAt)
    return {
      connectionUrl: connectionUrl(this.baseUrl, secret),
      permissions,
      expiresAt: expiresAtIso,
      redemption: redemptionContract(this.baseUrl, expiresAtIso),
    }
  }

  async redeemConnection(input: { connectionUrl: string }): Promise<AgentConnectionRedemptionResult> {
    const secret = extractConnectionSecret(input.connectionUrl)
    const now = this.now()
    const credential = generateOpaqueSecret()
    const credentialId = generateId('agent-credential')
    const store = await getSharedSpaceStore()
    const redemption = store.redeemOwnerAgentConnection({
      tokenHash: hashSecret(secret),
      now,
      credential: {
        id: credentialId,
        tokenHash: hashSecret(credential),
        createdAt: now,
        revokedAt: null,
        lastUsedAt: null,
      },
    })

    if (!redemption) {
      throw invalidConnection()
    }

    return {
      apiBaseUrl: this.baseUrl,
      permissions: redemption.credential.permissions,
      credential,
      createdAt: iso(redemption.credential.createdAt),
      nextAction: 'configure_agent',
    }
  }
}

export function __extractAgentConnectionSecretForTest(value: string): string {
  return extractConnectionSecret(value)
}
