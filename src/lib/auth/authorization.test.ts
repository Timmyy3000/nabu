import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  OWNER_VAULT_PRINCIPAL,
  VaultAuthorizationError,
  assertVaultPathAccess,
  isVaultPathInScope,
  resolveVaultPrincipal,
  toVaultAuthorizationResponse,
  toVaultWriteAuthorizationResponse,
} from './authorization'
import { AgentConnectionService } from './agent-connection'
import { hashSecret } from '../shared-spaces/crypto'
import { requireSharedSpaceOwner } from '../shared-spaces/http'
import { SharedSpaceService, __resetSharedSpaceServiceForTests } from '../shared-spaces/service'
import { getVaultBrowseData } from '../vault/service'
import { AUTH_COOKIE_NAME, createSessionToken } from './session'

const originalKnowledgePath = process.env.KNOWLEDGE_PATH
const originalDataPath = process.env.NABU_DATA_PATH
const originalPassword = process.env.NABU_PASSWORD
const roots: string[] = []

afterEach(async () => {
  process.env.KNOWLEDGE_PATH = originalKnowledgePath
  process.env.NABU_DATA_PATH = originalDataPath
  process.env.NABU_PASSWORD = originalPassword
  __resetSharedSpaceServiceForTests()
  await Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

async function fixture() {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-auth-vault-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-auth-data-'))
  roots.push(vaultRoot, dataRoot)
  await mkdir(path.join(vaultRoot, 'little-helpers'), { recursive: true })
  await writeFile(path.join(vaultRoot, 'little-helpers', 'note.md'), '# Note')
  await writeFile(path.join(vaultRoot, 'private.md'), '# Private')
  process.env.KNOWLEDGE_PATH = vaultRoot
  process.env.NABU_DATA_PATH = dataRoot
  process.env.NABU_PASSWORD = 'test-password'
  __resetSharedSpaceServiceForTests()
}

describe('vault authorization', () => {
  it('preserves the existing owner/password principal', async () => {
    await fixture()
    const sessionRequest = new Request('http://localhost', { headers: { cookie: 'nabu_session=invalid' } })
    expect(await resolveVaultPrincipal(sessionRequest)).toBeNull()
    expect(OWNER_VAULT_PRINCIPAL.principalId).toBe('owner')
    expect(isVaultPathInScope(OWNER_VAULT_PRINCIPAL, 'private.md')).toBe(true)
  })

  it('resolves a redeemed bearer token and enforces segment-aware scope', async () => {
    await fixture()
    const service = new SharedSpaceService({ now: () => 1_000, baseUrl: 'http://localhost:3000' })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    const confirmed = await service.confirmSharedSpace({
      ownerPrincipalId: 'owner',
      proposalId: proposal.proposalId,
      confirmed: true,
      permissions: ['read', 'write'],
    })
    const redeemed = await service.redeemSharedSpaceInvite({ inviteUrl: confirmed.inviteUrl })

    const principal = await resolveVaultPrincipal(
      new Request('http://localhost', { headers: { authorization: `Bearer ${redeemed.accessToken}` } }),
      1_000,
    )
    expect(principal).toMatchObject({ kind: 'shared', rootPath: 'little-helpers', permissions: ['read', 'write'] })
    expect(isVaultPathInScope(principal!, 'little-helpers/nested.md')).toBe(true)
    expect(isVaultPathInScope(principal!, 'little-helpers-private/nested.md')).toBe(false)
    expect(isVaultPathInScope(principal!, 'private.md')).toBe(false)
    expect(() => assertVaultPathAccess(principal!, 'private.md')).toThrow()
    expect((await service.getAccessTokenForTest(hashSecret(redeemed.accessToken)))?.lastUsedAt).toBe(1_000)
  })

  it('resolves durable owner-agent credentials with selected permissions but no management elevation', async () => {
    await fixture()
    const service = new AgentConnectionService({ now: () => 1_000, baseUrl: 'http://localhost:3000' })
    const issued = await service.issueConnection({ ownerPrincipalId: 'owner', permissions: ['read'] })
    const redeemed = await service.redeemConnection({ connectionUrl: issued.connectionUrl })

    const principal = await resolveVaultPrincipal(
      new Request('http://localhost', { headers: { authorization: `Bearer ${redeemed.credential}` } }),
      1_000,
    )

    expect(principal).toMatchObject({
      kind: 'owner-agent',
      principalId: expect.stringContaining('owner-agent:'),
      permissions: ['read'],
      rootPath: null,
      sharedSpaceId: null,
    })
    expect(isVaultPathInScope(principal!, 'private.md')).toBe(true)
    expect(toVaultWriteAuthorizationResponse(principal)?.status).toBe(403)
    expect(toVaultWriteAuthorizationResponse(OWNER_VAULT_PRINCIPAL)).toBeNull()

    const browse = await getVaultBrowseData({ folderPath: '', noteSlug: '', principal: principal! })
    expect(browse.folder.notes.map((note) => note.relPath)).toContain('private.md')

    const sharedSpaceManagement = await requireSharedSpaceOwner(
      new Request('http://localhost', { headers: { authorization: `Bearer ${redeemed.credential}` } }),
    )
    expect(sharedSpaceManagement.response?.status).toBe(403)
  })

  it('converts scoped authorization failures into safe HTTP responses', async () => {
    const response = toVaultAuthorizationResponse(new VaultAuthorizationError('The requested vault resource is not available.'))

    expect(response?.status).toBe(404)
    expect(await response?.json()).toEqual({ error: 'The requested vault resource is not available.' })
    expect(toVaultAuthorizationResponse(new Error('unrelated failure'))).toBeNull()
  })

  it('resolves a URL read link as read-only and never lets it broaden bearer or owner access', async () => {
    await fixture()
    const service = new SharedSpaceService({ now: () => 1_000, baseUrl: 'http://localhost:3000' })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    const confirmed = await service.confirmSharedSpace({
      ownerPrincipalId: 'owner',
      proposalId: proposal.proposalId,
      confirmed: true,
      permissions: ['read', 'write'],
    })
    const link = await service.issueReadLink({ ownerPrincipalId: 'owner', sharedSpaceId: confirmed.sharedSpaceId })
    const tokenRequest = new Request(link.shareUrl)
    expect(await resolveVaultPrincipal(tokenRequest, 1_000)).toMatchObject({
      kind: 'shared',
      permissions: ['read'],
      rootPath: 'little-helpers',
      sharedSpaceId: confirmed.sharedSpaceId,
    })

    const redeemed = await service.redeemSharedSpaceInvite({ inviteUrl: confirmed.inviteUrl })
    const bearerPrincipal = await resolveVaultPrincipal(
      new Request(link.shareUrl, { headers: { authorization: `Bearer ${redeemed.accessToken}` } }),
      1_000,
    )
    expect(bearerPrincipal).toMatchObject({ kind: 'shared', permissions: ['read', 'write'] })

    const ownerPrincipal = await resolveVaultPrincipal(
      new Request(link.shareUrl, { headers: { cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(createSessionToken(1_000))}` } }),
      1_000,
    )
    expect(ownerPrincipal).toEqual(OWNER_VAULT_PRINCIPAL)
  })

  it('rejects malformed, rotated, expired, and parent-revoked URL read links', async () => {
    await fixture()
    let now = 1_000
    const service = new SharedSpaceService({ now: () => now, baseUrl: 'http://localhost:3000' })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    const confirmed = await service.confirmSharedSpace({ ownerPrincipalId: 'owner', proposalId: proposal.proposalId, confirmed: true })
    const first = await service.issueReadLink({ ownerPrincipalId: 'owner', sharedSpaceId: confirmed.sharedSpaceId, durationDays: 1 })
    const second = await service.issueReadLink({ ownerPrincipalId: 'owner', sharedSpaceId: confirmed.sharedSpaceId, durationDays: 1 })

    expect(await resolveVaultPrincipal(new Request(first.shareUrl), now)).toBeNull()
    expect(await resolveVaultPrincipal(new Request('http://localhost:3000/?path=little-helpers&token=malformed'), now)).toBeNull()

    now = Date.parse(second.expiresAt) + 1
    expect(await resolveVaultPrincipal(new Request(second.shareUrl), now)).toBeNull()

    now = 1_000
    const third = await service.issueReadLink({ ownerPrincipalId: 'owner', sharedSpaceId: confirmed.sharedSpaceId })
    await service.revokeSharedSpace({ ownerPrincipalId: 'owner', sharedSpaceId: confirmed.sharedSpaceId })
    expect(await resolveVaultPrincipal(new Request(third.shareUrl), now)).toBeNull()
  })
})
