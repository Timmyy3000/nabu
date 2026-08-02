import { lstat, readdir } from 'node:fs/promises'
import path from 'node:path'
import { normalizeVaultPath } from '../paths'
import { getVaultConfig } from '../vault/config'
import { generateId, generateOpaqueSecret, hashSecret } from './crypto'
import { getSharedSpaceStore, __resetSharedSpaceStoreForTests } from './store'
import type {
  SharedSpaceDetails,
  SharedSpacePermission,
  SharedSpacePreview,
  SharedSpaceRecord,
} from './types'

export const DEFAULT_SHARED_SPACE_DURATION_DAYS = 7
export const MIN_SHARED_SPACE_DURATION_DAYS = 1
export const MAX_SHARED_SPACE_DURATION_DAYS = 30
export const INVITE_TTL_MS = 60 * 60 * 1_000
export const PROPOSAL_TTL_MS = 10 * 60 * 1_000
export const LIVE_SCOPE_WARNING = 'Any files or folders added under this path later will also be part of the shared space.'

export class SharedSpaceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
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
}

type SharedSpaceConfirmationInput = {
  ownerPrincipalId: string
  proposalId: string
  confirmed: boolean
  durationDays?: number | null
  permissions?: SharedSpacePermission[] | null
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
}

type SharedSpaceRedemptionResult = {
  sharedSpaceId: string
  rootPath: string
  permissions: SharedSpacePermission[]
  sharedSpaceExpiresAt: string
  accessToken: string
  accessTokenExpiresAt: string
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
  if (input == null || !input.trim()) {
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

async function scanSharedRoot(vaultRoot: string, rootPath: string, absoluteRoot: string): Promise<FolderScan> {
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
  const normalized = [...new Set(requested)]
  if (normalized.length === 0 || !normalized.includes('read') || normalized.some((permission) => permission !== 'read' && permission !== 'write')) {
    throw new SharedSpaceError('Shared-space permissions must include read and may include write.', 'SHARED_SPACE_PERMISSIONS_INVALID')
  }
  return normalized
}

function inviteUrl(baseUrl: string, secret: string): string {
  return new URL(`/invites/${secret}`, baseUrl).toString()
}

function extractInviteSecret(value: string): string {
  try {
    const url = new URL(value)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length !== 2 || segments[0] !== 'invites' || !segments[1]) {
      throw new Error('invalid invite path')
    }
    return decodeURIComponent(segments[1])
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
    this.baseUrl = options.baseUrl ?? process.env.NABU_PUBLIC_URL?.trim() ?? 'http://localhost:3000'
  }

  async proposeSharedSpace(input: SharedSpaceProposalInput): Promise<SharedSpacePreview> {
    const rootPath = normalizeSharedRoot(input.path)
    const { rootPath: vaultRoot } = await getVaultConfig()
    const absoluteRoot = await resolveRealSharedRoot(vaultRoot, rootPath)
    const scan = await scanSharedRoot(vaultRoot, rootPath, absoluteRoot)
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
    }
    const store = await getSharedSpaceStore()
    store.createProposal({
      id: proposalId,
      ownerPrincipalId: input.ownerPrincipalId,
      rootPath,
      preview,
      createdAt: now,
      expiresAt: now + PROPOSAL_TTL_MS,
    })
    return preview
  }

  async confirmSharedSpace(input: SharedSpaceConfirmationInput): Promise<SharedSpaceInviteResult> {
    if (input.confirmed !== true) {
      throw new SharedSpaceError('Explicit confirmation is required before sharing.', 'SHARED_SPACE_CONFIRMATION_REQUIRED')
    }
    const durationDays = normalizeDuration(input.durationDays)
    const permissions = normalizePermissions(input.permissions)
    const now = this.now()
    const store = await getSharedSpaceStore()
    const proposal = store.getProposal(input.proposalId)
    if (!proposal || proposal.ownerPrincipalId !== input.ownerPrincipalId || proposal.expiresAt <= now || proposal.consumedAt != null) {
      throw new SharedSpaceError('The sharing proposal is invalid or expired.', 'SHARED_SPACE_PROPOSAL_INVALID', 410)
    }
    const { rootPath: vaultRoot } = await getVaultConfig()
    await resolveRealSharedRoot(vaultRoot, proposal.rootPath)

    const space: SharedSpaceRecord = {
      id: generateId('space'),
      ownerPrincipalId: input.ownerPrincipalId,
      rootPath: proposal.rootPath,
      permissions,
      createdAt: now,
      expiresAt: now + durationDays * 24 * 60 * 60 * 1_000,
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
      inviteUrl: inviteUrl(input.baseUrl ?? this.baseUrl, secret),
      inviteExpiresAt: iso(invite.expiresAt),
      inviteUsesRemaining: 1,
    }
  }

  async redeemSharedSpaceInvite(input: { inviteUrl: string }): Promise<SharedSpaceRedemptionResult> {
    const secret = extractInviteSecret(input.inviteUrl)
    const now = this.now()
    const accessToken = generateOpaqueSecret()
    const principalId = generateId('member')
    const store = await getSharedSpaceStore()
    const inviteContext = store.getInviteContext(hashSecret(secret))
    if (
      !inviteContext ||
      inviteContext.invite.redeemedAt != null ||
      inviteContext.invite.expiresAt <= now ||
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
    })
    if (!inviteResult) {
      throw new SharedSpaceError('The invite is invalid or expired.', 'SHARED_SPACE_INVITE_INVALID', 410)
    }

    return {
      sharedSpaceId: inviteResult.space.id,
      rootPath: inviteResult.space.rootPath,
      permissions: inviteResult.space.permissions,
      sharedSpaceExpiresAt: iso(inviteResult.space.expiresAt),
      accessToken,
      accessTokenExpiresAt: iso(inviteResult.space.expiresAt),
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

  async createSharedSpaceInvite(input: { ownerPrincipalId: string; sharedSpaceId: string; baseUrl?: string }): Promise<{
    sharedSpaceId: string
    inviteUrl: string
    inviteExpiresAt: string
    inviteUsesRemaining: 1
  }> {
    const store = await getSharedSpaceStore()
    const space = store.getSpace(input.sharedSpaceId)
    const now = this.now()
    if (!space || space.ownerPrincipalId !== input.ownerPrincipalId || space.revokedAt != null || space.expiresAt <= now) {
      throw new SharedSpaceError('Shared space not found or expired.', 'SHARED_SPACE_NOT_FOUND', 404)
    }
    const secret = generateOpaqueSecret()
    const inviteExpiresAt = Math.min(now + INVITE_TTL_MS, space.expiresAt)
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
      inviteUrl: inviteUrl(input.baseUrl ?? this.baseUrl, secret),
      inviteExpiresAt: iso(inviteExpiresAt),
      inviteUsesRemaining: 1,
    }
  }

  async extendSharedSpace(input: { ownerPrincipalId: string; sharedSpaceId: string; durationDays: number; confirmed: boolean }): Promise<SharedSpaceDetails> {
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
    const maximumExpiry = space.createdAt + MAX_SHARED_SPACE_DURATION_DAYS * 24 * 60 * 60 * 1_000
    const requestedExpiry = Math.min(now + durationDays * 24 * 60 * 60 * 1_000, maximumExpiry)
    if (requestedExpiry <= space.expiresAt) {
      throw new SharedSpaceError('The requested extension does not extend the shared-space lease.', 'SHARED_SPACE_DURATION_INVALID')
    }
    const extended = store.extendSpace(space.id, requestedExpiry)
    if (!extended) {
      throw new SharedSpaceError('Shared space not found or revoked.', 'SHARED_SPACE_NOT_FOUND', 404)
    }
    return toDetails(extended)
  }

  async getAccessTokenForTest(tokenHash: string) {
    const store = await getSharedSpaceStore()
    return store.getAccessTokenForTest(tokenHash)
  }
}

export function __resetSharedSpaceServiceForTests(): void {
  __resetSharedSpaceStoreForTests()
}
