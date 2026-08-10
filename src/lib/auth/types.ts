import type { SharedSpacePermission } from '../shared-spaces/types'

export const OWNER_AGENT_CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1_000

export type OwnerAgentConnectionRecord = {
  id: string
  ownerPrincipalId: string
  tokenHash: string
  permissions: SharedSpacePermission[]
  createdAt: number
  expiresAt: number
  consumedAt: number | null
  credentialId: string | null
}

export type OwnerAgentCredentialRecord = {
  id: string
  tokenHash: string
  permissions: SharedSpacePermission[]
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  lastUsedAt: number | null
}

export type OwnerAgentCredentialInput = Omit<OwnerAgentCredentialRecord, 'permissions'>
