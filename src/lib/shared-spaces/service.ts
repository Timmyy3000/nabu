import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { normalizeVaultPath } from '../paths'
import { getVaultConfig } from '../vault/config'
import { deriveIdempotentAccessToken, generateId, generateOpaqueSecret, hashSecret, isValidIdempotencyKey } from './crypto'
import { getSharedSpaceStore, __resetSharedSpaceStoreForTests } from './store'
import { resolveCanonicalLink, resolveCanonicalPublicUrl } from './public-url'
import { SHARED_SPACE_AGENT_CONTRACT } from './agent-contract'
import type {
  SharedSpaceDetails,
  SharedSpacePermission,
  SharedSpacePreview,
  SharedSpaceReadLinkRecord,
  SharedSpaceRecord,
  SharedSpaceRedemptionContract,
  SharedSpaceRedemptionLinks,
} from './types'

export const DEFAULT_SHARED_SPACE_DURATION_DAYS = 7
export const MIN_SHARED_SPACE_DURATION_DAYS = 1
export const MAX_SHARED_SPACE_DURATION_DAYS = 183
export const SHARED_SPACE_DAY_MS = 24 * 60 * 60 * 1_000
export const INVITE_TTL_MS = 60 * 60 * 1_000
export const PROPOSAL_TTL_MS = 10 * 60 * 1_000
export const LIVE_SCOPE_WARNING = 'Any files or folders added under this path later will also be part of the shared space.'

export class SharedSpaceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
    public readonly nextAction?: string,
  ) {
    super(message)
    this.name = 'SharedSpaceError'
  }
}

type SharedSpaceServiceOptions = {
  now?: () => number
  baseUrl?: string
}

type SharedSpaceProposalInput = {
  ownerPrincipalId: string
  path: string | null | undefined
  durationDays?: number | null
  permissions?: SharedSpacePermission[] | null
  contractVersion?: number | null
}

type SharedSpaceConfirmationInput = {
  ownerPrincipalId: string
  proposalId: string
  confirmed: boolean
  durationDays?: number | null
  permissions?: SharedSpacePermission[] | null
  path?: string | null
  contractVersion?: number | null
  baseUrl?: string
}

type SharedSpaceInviteResult = {
  sharedSpaceId: string
  rootPath: string
  permissions: SharedSpacePermission[]
  sharedSpaceExpiresAt: string
  inviteUrl: string
  inviteExpiresAt: string
  inviteUsesRemaining: 1
  contractVersion: 2
  redemption: SharedSpaceRedemptionContract
}

type SharedSpaceRedemptionResult = {
  sharedSpaceId: string
  rootPath: string
  permissions: SharedSpacePermission[]
  sharedSpaceExpiresAt: string
  accessToken: string
  accessTokenExpiresAt: string
  contractVersion: 2
  profileId: string
  nextAction: 'save_credential_profile'
  links: SharedSpaceRedemptionLinks
}

export type SharedSpaceReadLinkResult = {
  sharedSpaceId: string
  rootPath: string
  permission: 'read'
  shareUrl: string
  durationDays: number
  expiresAt: string
}

type FolderScan = {
  files: string[]
  folders: string[]
  totalBytes: number
}

function iso(value: number): string {
  return new Date(value).toISOString()
}

function normalizeSharedRoot(input: string | null | undefined): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new SharedSpaceError('A non-root folder path is required.', 'SHARED_SPACE_PATH_UNSAFE')
  }

  let normalized: string
  try {
    normalized = normalizeVaultPath(input)
  } catch {
    throw new SharedSpaceError('The shared folder path is unsafe.', 'SHARED_SPACE_PATH_UNSAFE')
  }

  if (!normalized) {
    throw new SharedSpaceError('The vault root cannot be shared.', 'SHARED_SPACE_PATH_UNSAFE')
  }

  return normalized
}

async function resolveRealSharedRoot(rootPath: string, relativePath: string): Promise<string> {
  let rootStat
  try {
    rootStat = await lstat(rootPath)
  } catch {
    throw new SharedSpaceError('The vault root is unavailable.', 'SHARED_SPACE_PATH_UNSAFE', 404)
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new SharedSpaceError('The vault root must be a real directory.', 'SHARED_SPACE_PATH_UNSAFE')
  }

  let currentPath = rootPath
  for (const segment of relativePath.split('/')) {
    currentPath = path.join(currentPath, segment)
    let currentStat
    try {
      currentStat = await lstat(currentPath)
    } catch {
      throw new SharedSpaceError('The shared folder was not found.', 'SHARED_SPACE_PATH_UNSAFE', 404)
    }
    if (currentStat.isSymbolicLink() || (!currentStat.isDirectory() && segment === relativePath.split('/').at(-1))) {
      throw new SharedSpaceError('Symbolic links and non-folder roots cannot be shared.', 'SHARED_SPACE_PATH_UNSAFE')
    }
    if (!currentStat.isDirectory()) {
      throw new SharedSpaceError('The shared path must be a folder.', 'SHARED_SPACE_PATH_UNSAFE')
    }
  }

  const resolved = path.resolve(currentPath)
  const relativeToVault = path.relative(rootPath, resolved)
  if (!relativeToVault || relativeToVault.startsWith('..') || path.isAbsolute(relativeToVault)) {
    throw new SharedSpaceError('The shared path must remain inside the vault.', 'SHARED_SPACE_PATH_UNSAFE')
  }

  return resolved
}

async function scanSharedRoot(vaultRoot: string, absoluteRoot: string): Promise<FolderScan> {
  const files: string[] = []
  const folders: string[] = []
  let totalBytes = 0

  async function visit(currentAbsolutePath: string): Promise<void> {
    const entries = await readdir(currentAbsolutePath, { withFileTypes: true })
    for (const entry of entries) {
      const absoluteEntryPath = path.join(currentAbsolutePath, entry.name)
      const relativeEntryPath = path.relative(vaultRoot, absoluteEntryPath).replace(/\\/g, '/')
      const entryStat = await lstat(absoluteEntryPath)
      if (entryStat.isSymbolicLink()) {
        throw new SharedSpaceError('Symbolic links cannot be included in a shared space.', 'SHARED_SPACE_PATH_UNSAFE')
      }

      if (entry.isDirectory()) {
        folders.push(relativeEntryPath)
        await visit(absoluteEntryPath)
        continue
      }

      if (entry.isFile()) {
        files.push(relativeEntryPath)
        totalBytes += entryStat.size
      }
    }
  }

  await visit(absoluteRoot)
  const stablePathOrder = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)
  files.sort(stablePathOrder)
  folders.sort(stablePathOrder)
  return { files, folders, totalBytes }
}

function normalizeDuration(durationDays: number | null | undefined): number {
  const value = durationDays ?? DEFAULT_SHARED_SPACE_DURATION_DAYS
  if (!Number.isInteger(value) || value < MIN_SHARED_SPACE_DURATION_DAYS || value > MAX_SHARED_SPACE_DURATION_DAYS) {
    throw new SharedSpaceError(
      `Shared-space duration must be between ${MIN_SHARED_SPACE_DURATION_DAYS} and ${MAX_SHARED_SPACE_DURATION_DAYS} days.`,
      'SHARED_SPACE_DURATION_INVALID',
    )
  }
  return value
}

function normalizePermissions(permissions: SharedSpacePermission[] | null | undefined): SharedSpacePermission[] {
  const requested = permissions ?? ['read', 'write']
  if (!Array.isArray(requested)) {
    throw new SharedSpaceError('Shared-space permissions must include read and may include write.', 'SHARED_SPACE_PERMISSIONS_INVALID')
  }
  const normalized = [...new Set(requested)]
  if (normalized.length === 0 || !normalized.includes('read') || normalized.some((permission) => permission !== 'read' && permission !== 'write')) {
    throw new SharedSpaceError('Shared-space permissions must include read and may include write.', 'SHARED_SPACE_PERMISSIONS_INVALID')
  }
  return (['read', 'write'] as const).filter((permission) => normalized.includes(permission))
}

function inviteUrl(baseUrl: string, secret: string): string {
  return resolveCanonicalLink(baseUrl, `/invites/${encodeURIComponent(secret)}`).toString()
}

function readLinkUrl(baseUrl: string, rootPath: string, secret: string): string {
  const url = resolveCanonicalLink(baseUrl, '/')
  url.searchParams.set('path', rootPath)
  url.searchParams.set('token', secret)
  return url.toString()
}

function profileId(baseUrl: string, sharedSpaceId: string): string {
  return `nabu-profile-${hashSecret(`${baseUrl}\n${sharedSpaceId}`).slice(0, 32)}`
}

function redemptionLinks(): SharedSpaceRedemptionLinks {
  return { ...SHARED_SPACE_AGENT_CONTRACT.redemption.responseLinks }
}

function redemptionContract(expiresAt: string): SharedSpaceRedemptionContract {
  return {
    contractVersion: 2,
    endpoint: SHARED_SPACE_AGENT_CONTRACT.redemption.endpoint,
    method: 'POST',
    bodyField: 'inviteUrl',
    idempotencyHeader: 'Idempotency-Key',
    idempotencyRequired: true,
    expiresAt,
    nextAction: 'redeem_and_save_profile',
  }
}

function extractInviteSecret(value: string): string {
  try {
    const url = new URL(value)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length < 2 || segments.at(-2) !== 'invites' || !segments.at(-1)) {
      throw new Error('invalid invite path')
    }
    return decodeURIComponent(segments.at(-1)!)
  } catch {
    throw new SharedSpaceError('The invite is invalid or expired.', 'SHARED_SPACE_INVITE_INVALID', 410)
  }
}

function toDetails(space: SharedSpaceRecord): SharedSpaceDetails {
  return {
    sharedSpaceId: space.id,
    rootPath: space.rootPath,
    permissions: space.permissions,
    sharedSpaceExpiresAt: iso(space.expiresAt),
    revokedAt: space.revokedAt == null ? null : iso(space.revokedAt),
  }
}

export class SharedSpaceService {
  private readonly now: () => number
  private readonly baseUrl: string

  constructor(options: SharedSpaceServiceOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.baseUrl = resolveCanonicalPublicUrl({ configuredBaseUrl: options.baseUrl })
  }

  async proposeSharedSpace(input: SharedSpaceProposalInput): Promise<SharedSpacePreview> {
    const isVersion2 = input.contractVersion === 2
    if (input.contractVersion != null && input.contractVersion !== 2) {
      throw new SharedSpaceError('The proposal contract version is unsupported.', 'SHARED_SPACE_CONTRACT_VERSION_UNSUPPORTED')
    }
    const durationDays = normalizeDuration(input.durationDays)
    const permissions = isVersion2 ? normalizePermissions(input.permissions) : null
    if (isVersion2 && typeof input.durationDays !== 'number') {
      throw new SharedSpaceError('Version-2 proposals must include durationDays.', 'SHARED_SPACE_DURATION_INVALID')
    }
    if (isVersion2 && !Array.isArray(input.permissions)) {
      throw new SharedSpaceError('Version-2 proposals must include permissions.', 'SHARED_SPACE_PERMISSIONS_INVALID')
    }
    const rootPath = normalizeSharedRoot(input.path)
    const { rootPath: vaultRoot } = await getVaultConfig()
    const absoluteRoot = await resolveRealSharedRoot(vaultRoot, rootPath)
    const scan = await scanSharedRoot(vaultRoot, absoluteRoot)
    const now = this.now()
    const proposalId = generateId('proposal')
    const preview: SharedSpacePreview = {
      proposalId,
      rootPath,
      files: scan.files,
      folders: scan.folders,
      fileCount: scan.files.length,
      totalBytes: scan.totalBytes,
      warnings: [LIVE_SCOPE_WARNING],
      liveRecursiveScope: true,
      expiresAt: iso(now + PROPOSAL_TTL_MS),
      ...(isVersion2 ? { contractVersion: 2 as const, durationDays, permissions: permissions! } : {}),
    }
    const store = await getSharedSpaceStore()
    store.createProposal({
      id: proposalId,
      ownerPrincipalId: input.ownerPrincipalId,
      rootPath,
      preview,
      createdAt: now,
      expiresAt: now + PROPOSAL_TTL_MS,
      ...(isVersion2 ? { contractVersion: 2 as const, requestedDurationDays: durationDays, requestedPermissions: permissions! } : {}),
    })
    return preview
  }

  async confirmSharedSpace(input: SharedSpaceConfirmationInput): Promise<SharedSpaceInviteResult> {
    if (input.confirmed !== true) {
      throw new SharedSpaceError('Explicit confirmation is required before sharing.', 'SHARED_SPACE_CONFIRMATION_REQUIRED')
    }
    const now = this.now()
    const store = await getSharedSpaceStore()
    const proposal = store.getProposal(input.proposalId)
    if (!proposal || proposal.ownerPrincipalId !== input.ownerPrincipalId) {
      throw new SharedSpaceError('The sharing proposal is invalid or expired.', 'SHARED_SPACE_PROPOSAL_INVALID', 410)
    }
    if (proposal.consumedAt != null) {
      throw new SharedSpaceError('The sharing proposal is invalid or expired.', 'SHARED_SPACE_PROPOSAL_INVALID', 410)
    }
    const proposalVersion = proposal.contractVersion === 2 ? 2 : 1
    if (proposal.expiresAt <= now) {
      if (proposalVersion === 1) {
        throw new SharedSpaceError('The sharing proposal is invalid or expired.', 'SHARED_SPACE_PROPOSAL_INVALID', 410)
      }
      throw new SharedSpaceError(
        'The sharing proposal expired. Create a new proposal to continue.',
        'SHARED_SPACE_PROPOSAL_EXPIRED',
        410,
        'create_new_proposal',
      )
    }

    if (proposalVersion === 2) {
      if (input.contractVersion != null && input.contractVersion !== 2) {
        throw new SharedSpaceError('The confirmation does not match the proposal contract.', 'SHARED_SPACE_PROPOSAL_CONSENT_MISMATCH')
      }
      if (input.path != null && normalizeSharedRoot(input.path) !== proposal.rootPath) {
        throw new SharedSpaceError('The confirmation does not match the proposed scope.', 'SHARED_SPACE_PROPOSAL_CONSENT_MISMATCH')
      }
      if (input.durationDays != null && input.durationDays !== proposal.requestedDurationDays) {
        throw new SharedSpaceError('The confirmation does not match the proposed duration.', 'SHARED_SPACE_PROPOSAL_CONSENT_MISMATCH')
      }
      if (input.permissions != null && JSON.stringify(normalizePermissions(input.permissions)) !== JSON.stringify(proposal.requestedPermissions ?? [])) {
        throw new SharedSpaceError('The confirmation does not match the proposed permissions.', 'SHARED_SPACE_PROPOSAL_CONSENT_MISMATCH')
      }
    }

    const durationDays = proposalVersion === 2
      ? proposal.requestedDurationDays ?? normalizeDuration(input.durationDays)
      : normalizeDuration(input.durationDays)
    const permissions = proposalVersion === 2
      ? proposal.requestedPermissions ?? normalizePermissions(input.permissions)
      : normalizePermissions(input.permissions)
    const { rootPath: vaultRoot } = await getVaultConfig()
    await resolveRealSharedRoot(vaultRoot, proposal.rootPath)

    const space: SharedSpaceRecord = {
      id: generateId('space'),
      ownerPrincipalId: input.ownerPrincipalId,
      rootPath: proposal.rootPath,
      permissions,
      createdAt: now,
      expiresAt: now + durationDays * SHARED_SPACE_DAY_MS,
      revokedAt: null,
    }
    const secret = generateOpaqueSecret()
    const invite = {
      id: generateId('invite'),
      sharedSpaceId: space.id,
      tokenHash: hashSecret(secret),
      createdAt: now,
      expiresAt: Math.min(now + INVITE_TTL_MS, space.expiresAt),
      redeemedAt: null,
      redeemedByPrincipalId: null,
    }
    const created = store.consumeProposalAndCreateSpace({
      proposalId: input.proposalId,
      ownerPrincipalId: input.ownerPrincipalId,
      now,
      space,
      invite,
    })
    if (!created) {
      throw new SharedSpaceError('The sharing proposal is invalid or expired.', 'SHARED_SPACE_PROPOSAL_INVALID', 410)
    }

    return {
      sharedSpaceId: space.id,
      rootPath: space.rootPath,
      permissions: space.permissions,
      sharedSpaceExpiresAt: iso(space.expiresAt),
      inviteUrl: inviteUrl(resolveCanonicalPublicUrl({ configuredBaseUrl: input.baseUrl ?? this.baseUrl }), secret),
      inviteExpiresAt: iso(invite.expiresAt),
      inviteUsesRemaining: 1,
      contractVersion: 2,
      redemption: redemptionContract(iso(invite.expiresAt)),
    }
  }

  async redeemSharedSpaceInvite(input: { inviteUrl: string; idempotencyKey?: string | null }): Promise<SharedSpaceRedemptionResult> {
    const secret = extractInviteSecret(input.inviteUrl)
    const idempotencyKey = input.idempotencyKey ?? null
    if (idempotencyKey != null && !isValidIdempotencyKey(idempotencyKey)) {
      throw new SharedSpaceError('The Idempotency-Key is invalid.', 'SHARED_SPACE_IDEMPOTENCY_KEY_INVALID')
    }
    const now = this.now()
    const accessToken = idempotencyKey == null ? generateOpaqueSecret() : deriveIdempotentAccessToken(secret, idempotencyKey)
    const principalId = generateId('member')
    const store = await getSharedSpaceStore()
    const inviteContext = store.getInviteContext(hashSecret(secret))
    if (
      !inviteContext ||
      (inviteContext.invite.redeemedAt == null && inviteContext.invite.expiresAt <= now) ||
      inviteContext.space.expiresAt <= now ||
      inviteContext.space.revokedAt != null
    ) {
      throw new SharedSpaceError('The invite is invalid or expired.', 'SHARED_SPACE_INVITE_INVALID', 410)
    }

    const inviteResult = store.redeemInvite({
      tokenHash: hashSecret(secret),
      now,
      principalId,
      accessToken: {
        id: generateId('access'),
        sharedSpaceId: inviteContext.space.id,
        tokenHash: hashSecret(accessToken),
        principalId,
        permissions: inviteContext.space.permissions,
        createdAt: now,
        expiresAt: inviteContext.space.expiresAt,
        revokedAt: null,
        lastUsedAt: null,
        rootPath: inviteContext.space.rootPath,
        sharedSpaceExpiresAt: inviteContext.space.expiresAt,
        sharedSpaceRevokedAt: inviteContext.space.revokedAt,
      },
      idempotencyKeyHash: idempotencyKey == null ? null : hashSecret(idempotencyKey),
    })
    if (!inviteResult) {
      throw new SharedSpaceError('The invite is invalid or expired.', 'SHARED_SPACE_INVITE_INVALID', 410)
    }

    const baseUrl = this.baseUrl
    return {
      sharedSpaceId: inviteResult.space.id,
      rootPath: inviteResult.space.rootPath,
      permissions: inviteResult.space.permissions,
      sharedSpaceExpiresAt: iso(inviteResult.space.expiresAt),
      accessToken,
      accessTokenExpiresAt: iso(inviteResult.space.expiresAt),
      contractVersion: 2,
      profileId: profileId(baseUrl, inviteResult.space.id),
      nextAction: 'save_credential_profile',
      links: redemptionLinks(),
    }
  }

  async listSharedSpaces(input: { ownerPrincipalId: string }): Promise<SharedSpaceDetails[]> {
    const store = await getSharedSpaceStore()
    return store.listSpaces(input.ownerPrincipalId).map(toDetails)
  }

  async getSharedSpace(input: { ownerPrincipalId: string; sharedSpaceId: string }): Promise<SharedSpaceDetails> {
    const store = await getSharedSpaceStore()
    const space = store.getSpace(input.sharedSpaceId)
    if (!space || space.ownerPrincipalId !== input.ownerPrincipalId) {
      throw new SharedSpaceError('Shared space not found.', 'SHARED_SPACE_NOT_FOUND', 404)
    }
    return toDetails(space)
  }

  async revokeSharedSpace(input: { ownerPrincipalId: string; sharedSpaceId: string }): Promise<SharedSpaceDetails> {
    const store = await getSharedSpaceStore()
    const space = store.getSpace(input.sharedSpaceId)
    if (!space || space.ownerPrincipalId !== input.ownerPrincipalId) {
      throw new SharedSpaceError('Shared space not found.', 'SHARED_SPACE_NOT_FOUND', 404)
    }
    store.revokeSpace(space.id, this.now())
    return toDetails(store.getSpace(space.id) ?? { ...space, revokedAt: this.now() })
  }

  async createSharedSpaceInvite(input: { ownerPrincipalId: string; sharedSpaceId: string; baseUrl?: string }): Promise<SharedSpaceInviteResult> {
    const store = await getSharedSpaceStore()
    const space = store.getSpace(input.sharedSpaceId)
    const now = this.now()
    if (!space || space.ownerPrincipalId !== input.ownerPrincipalId || space.revokedAt != null || space.expiresAt <= now) {
      throw new SharedSpaceError('Shared space not found or expired.', 'SHARED_SPACE_NOT_FOUND', 404)
    }
    const secret = generateOpaqueSecret()
    const inviteExpiresAt = Math.min(now + INVITE_TTL_MS, space.expiresAt)
    const canonicalBaseUrl = resolveCanonicalPublicUrl({ configuredBaseUrl: input.baseUrl ?? this.baseUrl })
    store.createInvite({
      id: generateId('invite'),
      sharedSpaceId: space.id,
      tokenHash: hashSecret(secret),
      createdAt: now,
      expiresAt: inviteExpiresAt,
      redeemedAt: null,
      redeemedByPrincipalId: null,
    })
    return {
      sharedSpaceId: space.id,
      rootPath: space.rootPath,
      permissions: space.permissions,
      sharedSpaceExpiresAt: iso(space.expiresAt),
      inviteUrl: inviteUrl(canonicalBaseUrl, secret),
      inviteExpiresAt: iso(inviteExpiresAt),
      inviteUsesRemaining: 1,
      contractVersion: 2,
      redemption: redemptionContract(iso(inviteExpiresAt)),
    }
  }

  async extendSharedSpace(input: { ownerPrincipalId: string; sharedSpaceId: string; durationDays?: number | null; confirmed: boolean }): Promise<SharedSpaceDetails> {
    if (input.confirmed !== true) {
      throw new SharedSpaceError('Explicit confirmation is required before extending a shared space.', 'SHARED_SPACE_CONFIRMATION_REQUIRED')
    }
    const durationDays = normalizeDuration(input.durationDays)
    const store = await getSharedSpaceStore()
    const space = store.getSpace(input.sharedSpaceId)
    const now = this.now()
    if (!space || space.ownerPrincipalId !== input.ownerPrincipalId || space.revokedAt != null || space.expiresAt <= now) {
      throw new SharedSpaceError('Shared space not found or expired.', 'SHARED_SPACE_NOT_FOUND', 404)
    }
    const maximumExpiry = space.createdAt + MAX_SHARED_SPACE_DURATION_DAYS * SHARED_SPACE_DAY_MS
    const requestedExpiry = Math.min(now + durationDays * SHARED_SPACE_DAY_MS, maximumExpiry)
    if (requestedExpiry <= space.expiresAt) {
      throw new SharedSpaceError('The requested extension does not extend the shared-space lease.', 'SHARED_SPACE_DURATION_INVALID')
    }
    const extended = store.extendSpace(space.id, requestedExpiry)
    if (!extended) {
      throw new SharedSpaceError('Shared space not found or revoked.', 'SHARED_SPACE_NOT_FOUND', 404)
    }
    return toDetails(extended)
  }

  async issueReadLink(input: {
    ownerPrincipalId: string
    sharedSpaceId: string
    durationDays?: number | null
    baseUrl?: string
  }): Promise<SharedSpaceReadLinkResult> {
    const durationDays = normalizeDuration(input.durationDays)
    const store = await getSharedSpaceStore()
    const now = this.now()
    const space = store.getSpace(input.sharedSpaceId)
    if (!space || space.ownerPrincipalId !== input.ownerPrincipalId || space.revokedAt != null || space.expiresAt <= now) {
      throw new SharedSpaceError('Shared space not found or expired.', 'SHARED_SPACE_NOT_FOUND', 404)
    }

    const secret = generateOpaqueSecret()
    const expiresAt = Math.min(now + durationDays * SHARED_SPACE_DAY_MS, space.expiresAt)
    const canonicalBaseUrl = resolveCanonicalPublicUrl({ configuredBaseUrl: input.baseUrl ?? this.baseUrl })
    const link = store.rotateReadLink({
      id: generateId('read-link'),
      sharedSpaceId: space.id,
      tokenHash: hashSecret(secret),
      createdAt: now,
      expiresAt,
      revokedAt: null,
    })

    return {
      sharedSpaceId: space.id,
      rootPath: space.rootPath,
      permission: 'read',
      shareUrl: readLinkUrl(canonicalBaseUrl, space.rootPath, secret),
      durationDays,
      expiresAt: iso(link.expiresAt),
    }
  }

  async revokeReadLink(input: { ownerPrincipalId: string; sharedSpaceId: string }): Promise<void> {
    const store = await getSharedSpaceStore()
    const space = store.getSpace(input.sharedSpaceId)
    if (!space || space.ownerPrincipalId !== input.ownerPrincipalId) {
      throw new SharedSpaceError('Shared space not found.', 'SHARED_SPACE_NOT_FOUND', 404)
    }
    store.revokeReadLink(space.id, this.now())
  }

  async getAccessTokenForTest(tokenHash: string) {
    const store = await getSharedSpaceStore()
    return store.getAccessTokenForTest(tokenHash)
  }

  async getReadLinkForTest(sharedSpaceId: string): Promise<SharedSpaceReadLinkRecord | null> {
    const store = await getSharedSpaceStore()
    return store.getReadLinkForTest(sharedSpaceId)
  }
}

export function __resetSharedSpaceServiceForTests(): void {
  __resetSharedSpaceStoreForTests()
}
