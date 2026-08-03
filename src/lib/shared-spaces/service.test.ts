import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_SHARED_SPACE_DURATION_DAYS,
  INVITE_TTL_MS,
  MAX_SHARED_SPACE_DURATION_DAYS,
  MIN_SHARED_SPACE_DURATION_DAYS,
  SharedSpaceService,
  __resetSharedSpaceServiceForTests,
} from './service'
import { hashSecret } from './crypto'

const originalKnowledgePath = process.env.KNOWLEDGE_PATH
const originalDataPath = process.env.NABU_DATA_PATH
const tempRoots: string[] = []

async function createFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nabu-shared-space-'))
  const dataPath = await mkdtemp(path.join(os.tmpdir(), 'nabu-shared-space-data-'))
  tempRoots.push(root, dataPath)

  await Promise.all(
    Object.entries(files).map(async ([relPath, contents]) => {
      const absolutePath = path.join(root, relPath)
      await mkdir(path.dirname(absolutePath), { recursive: true })
      await writeFile(absolutePath, contents)
    }),
  )

  process.env.KNOWLEDGE_PATH = root
  process.env.NABU_DATA_PATH = dataPath
  __resetSharedSpaceServiceForTests()
  return root
}

afterEach(async () => {
  process.env.KNOWLEDGE_PATH = originalKnowledgePath
  process.env.NABU_DATA_PATH = originalDataPath
  __resetSharedSpaceServiceForTests()
  await Promise.allSettled(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('shared-space service', () => {
  it('creates a complete recursive live-scope proposal without sharing', async () => {
    await createFixture({
      'little-helpers/README.md': '# Helpers',
      'little-helpers/decisions/api.md': '# API',
      'little-helpers/research/competitors.md': '# Competitors',
      'little-helpers/assets/logo.txt': 'asset',
    })
    const service = new SharedSpaceService({ now: () => 1_000, baseUrl: 'https://nabu.example' })

    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })

    expect(proposal).toMatchObject({
      rootPath: 'little-helpers',
      files: [
        'little-helpers/README.md',
        'little-helpers/assets/logo.txt',
        'little-helpers/decisions/api.md',
        'little-helpers/research/competitors.md',
      ],
      folders: ['little-helpers/assets', 'little-helpers/decisions', 'little-helpers/research'],
      fileCount: 4,
      totalBytes: expect.any(Number),
      liveRecursiveScope: true,
      expiresAt: new Date(1_000 + 10 * 60 * 1_000).toISOString(),
    })
    expect(proposal.warnings.join(' ')).toContain('added under this path later')
    expect(await service.listSharedSpaces({ ownerPrincipalId: 'owner' })).toEqual([])
  })

  it('rejects root, traversal, absolute, and symlink proposal paths', async () => {
    const root = await createFixture({ 'little-helpers/readme.md': '# Helpers' })
    const outside = await mkdtemp(path.join(os.tmpdir(), 'nabu-shared-space-outside-'))
    tempRoots.push(outside)
    await symlink(outside, path.join(root, 'linked'), 'junction')
    const service = new SharedSpaceService({ now: () => 1_000 })

    for (const unsafePath of ['', '.', '..', '../private', path.join(root, 'little-helpers'), 'linked']) {
      await expect(service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: unsafePath })).rejects.toMatchObject({
        code: 'SHARED_SPACE_PATH_UNSAFE',
      })
    }
  })

  it('requires explicit confirmation and enforces lease duration bounds', async () => {
    await createFixture({ 'little-helpers/readme.md': '# Helpers' })
    const service = new SharedSpaceService({ now: () => 1_000, baseUrl: 'https://nabu.example' })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })

    await expect(
      service.confirmSharedSpace({ ownerPrincipalId: 'owner', proposalId: proposal.proposalId, confirmed: false }),
    ).rejects.toMatchObject({ code: 'SHARED_SPACE_CONFIRMATION_REQUIRED' })
    await expect(
      service.confirmSharedSpace({
        ownerPrincipalId: 'owner',
        proposalId: proposal.proposalId,
        confirmed: true,
        durationDays: MIN_SHARED_SPACE_DURATION_DAYS - 1,
      }),
    ).rejects.toMatchObject({ code: 'SHARED_SPACE_DURATION_INVALID' })
    await expect(
      service.confirmSharedSpace({
        ownerPrincipalId: 'owner',
        proposalId: proposal.proposalId,
        confirmed: true,
        durationDays: MAX_SHARED_SPACE_DURATION_DAYS + 1,
      }),
    ).rejects.toMatchObject({ code: 'SHARED_SPACE_DURATION_INVALID' })

    const confirmed = await service.confirmSharedSpace({
      ownerPrincipalId: 'owner',
      proposalId: proposal.proposalId,
      confirmed: true,
    })
    expect(confirmed.sharedSpaceExpiresAt).toBe(
      new Date(1_000 + DEFAULT_SHARED_SPACE_DURATION_DAYS * 24 * 60 * 60 * 1_000).toISOString(),
    )
    expect(confirmed.inviteExpiresAt).toBe(new Date(1_000 + INVITE_TTL_MS).toISOString())
    expect(confirmed.inviteUrl).toMatch(/^https:\/\/nabu\.example\/invites\/[A-Za-z0-9_-]+$/)
  })

  it('expires proposals before they can create a shared space', async () => {
    await createFixture({ 'little-helpers/readme.md': '# Helpers' })
    let now = 1_000
    const service = new SharedSpaceService({ now: () => now })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    now += 10 * 60 * 1_000 + 1

    await expect(
      service.confirmSharedSpace({ ownerPrincipalId: 'owner', proposalId: proposal.proposalId, confirmed: true }),
    ).rejects.toMatchObject({ code: 'SHARED_SPACE_PROPOSAL_INVALID', status: 410 })
  })

  it('redeems a one-time invite atomically and stores only hashes', async () => {
    await createFixture({ 'little-helpers/readme.md': '# Helpers' })
    const service = new SharedSpaceService({ now: () => 1_000, baseUrl: 'https://nabu.example' })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    const confirmed = await service.confirmSharedSpace({
      ownerPrincipalId: 'owner',
      proposalId: proposal.proposalId,
      confirmed: true,
      permissions: ['read', 'write'],
    })

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => service.redeemSharedSpaceInvite({ inviteUrl: confirmed.inviteUrl })),
    )
    const successes = results.filter((result) => result.status === 'fulfilled')
    const failures = results.filter((result) => result.status === 'rejected')

    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(7)
    const redeemed = successes[0]
    if (redeemed?.status !== 'fulfilled') {
      throw new Error('expected a successful redemption')
    }
    expect('accessTokenHash' in redeemed.value).toBe(false)
    expect(redeemed.value.sharedSpaceId).toBe(confirmed.sharedSpaceId)

    const accessToken = await service.getAccessTokenForTest(hashSecret(redeemed.value.accessToken))
    expect(accessToken?.tokenHash).toBe(hashSecret(redeemed.value.accessToken))
    expect(accessToken?.tokenHash).not.toContain(redeemed.value.accessToken)
  })

  it('rejects expired and revoked invites and access tokens using server time', async () => {
    await createFixture({ 'little-helpers/readme.md': '# Helpers' })
    let now = 1_000
    const service = new SharedSpaceService({ now: () => now, baseUrl: 'https://nabu.example' })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    const confirmed = await service.confirmSharedSpace({
      ownerPrincipalId: 'owner',
      proposalId: proposal.proposalId,
      confirmed: true,
    })

    now += INVITE_TTL_MS + 1
    await expect(service.redeemSharedSpaceInvite({ inviteUrl: confirmed.inviteUrl })).rejects.toMatchObject({
      code: 'SHARED_SPACE_INVITE_INVALID',
    })

    now = 1_000
    const secondProposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    const second = await service.confirmSharedSpace({
      ownerPrincipalId: 'owner',
      proposalId: secondProposal.proposalId,
      confirmed: true,
    })
    await service.revokeSharedSpace({ ownerPrincipalId: 'owner', sharedSpaceId: second.sharedSpaceId })
    await expect(service.redeemSharedSpaceInvite({ inviteUrl: second.inviteUrl })).rejects.toMatchObject({
      code: 'SHARED_SPACE_INVITE_INVALID',
    })
  })

  it('extends active leases and keeps redeemed tokens valid through the extension', async () => {
    await createFixture({ 'little-helpers/readme.md': '# Helpers' })
    const service = new SharedSpaceService({ now: () => 1_000, baseUrl: 'https://nabu.example' })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    const confirmed = await service.confirmSharedSpace({
      ownerPrincipalId: 'owner',
      proposalId: proposal.proposalId,
      confirmed: true,
      durationDays: 7,
    })
    const redeemed = await service.redeemSharedSpaceInvite({ inviteUrl: confirmed.inviteUrl })
    const extended = await service.extendSharedSpace({
      ownerPrincipalId: 'owner',
      sharedSpaceId: confirmed.sharedSpaceId,
      durationDays: 14,
      confirmed: true,
    })

    const accessToken = await service.getAccessTokenForTest(hashSecret(redeemed.accessToken))
    expect(extended.sharedSpaceExpiresAt).toBe(new Date(1_000 + 14 * 24 * 60 * 60 * 1_000).toISOString())
    expect(accessToken?.expiresAt).toBe(Date.parse(extended.sharedSpaceExpiresAt))
  })
})
