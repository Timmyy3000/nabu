import type { SharedSpacePermission } from '../shared-spaces/types'

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
  revokedAt: number | null
  lastUsedAt: number | null
}

export type OwnerAgentCredentialInput = Omit<OwnerAgentCredentialRecord, 'permissions'>
