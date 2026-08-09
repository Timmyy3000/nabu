export type SharedSpacePermission = 'read' | 'write'

export type SharedSpacePreview = {
  proposalId: string
  rootPath: string
  files: string[]
  folders: string[]
  fileCount: number
  totalBytes: number
  warnings: string[]
  liveRecursiveScope: true
  expiresAt: string
  contractVersion?: 2
  durationDays?: number
  permissions?: SharedSpacePermission[]
}

export type SharedSpaceProposalRecord = {
  id: string
  ownerPrincipalId: string
  rootPath: string
  preview: SharedSpacePreview
  createdAt: number
  expiresAt: number
  consumedAt: number | null
  contractVersion?: 1 | 2
  requestedDurationDays?: number | null
  requestedPermissions?: SharedSpacePermission[] | null
}

export type SharedSpaceRecord = {
  id: string
  ownerPrincipalId: string
  rootPath: string
  permissions: SharedSpacePermission[]
  createdAt: number
  expiresAt: number
  revokedAt: number | null
}

export type SharedSpaceInviteRecord = {
  id: string
  sharedSpaceId: string
  tokenHash: string
  createdAt: number
  expiresAt: number
  redeemedAt: number | null
  redeemedByPrincipalId: string | null
  idempotencyKeyHash?: string | null
  accessTokenHash?: string | null
  accessTokenId?: string | null
}

export type SharedSpaceAccessTokenRecord = {
  id: string
  sharedSpaceId: string
  tokenHash: string
  principalId: string
  permissions: SharedSpacePermission[]
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  lastUsedAt: number | null
  rootPath: string
  sharedSpaceExpiresAt: number
  sharedSpaceRevokedAt: number | null
}

export type SharedSpaceReadLinkRecord = {
  id: string
  sharedSpaceId: string
  tokenHash: string
  createdAt: number
  expiresAt: number
  revokedAt: number | null
  rootPath: string
  sharedSpaceExpiresAt: number
  sharedSpaceRevokedAt: number | null
}

export type SharedSpaceDetails = {
  sharedSpaceId: string
  rootPath: string
  permissions: SharedSpacePermission[]
  sharedSpaceExpiresAt: string
  revokedAt: string | null
}

export type SharedSpaceRedemptionLinks = {
  tree: string
  rootFolder: string
  noteByPath: string
  search: string
}

export type SharedSpaceRedemptionContract = {
  contractVersion: 2
  endpoint: string
  method: 'POST'
  bodyField: 'inviteUrl'
  idempotencyHeader: 'Idempotency-Key'
  idempotencyRequired: true
  expiresAt: string
  nextAction: 'redeem_and_save_profile'
}
