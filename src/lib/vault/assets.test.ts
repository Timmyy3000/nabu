import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveVaultPrincipal } from '../auth/authorization'
import { SharedSpaceService, __resetSharedSpaceServiceForTests } from '../shared-spaces/service'
import { getVaultAssetResponse } from './assets'
import { __resetVaultServiceForTests } from './service'

const originalKnowledgePath = process.env.KNOWLEDGE_PATH
const originalDataPath = process.env.NABU_DATA_PATH
const originalPassword = process.env.NABU_PASSWORD
const roots: string[] = []

afterEach(async () => {
  process.env.KNOWLEDGE_PATH = originalKnowledgePath
  process.env.NABU_DATA_PATH = originalDataPath
  process.env.NABU_PASSWORD = originalPassword
  __resetSharedSpaceServiceForTests()
  __resetVaultServiceForTests()
  await Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

async function fixture() {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-asset-vault-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-asset-data-'))
  roots.push(vaultRoot, dataRoot)
  await mkdir(path.join(vaultRoot, 'shared'), { recursive: true })
  await mkdir(path.join(vaultRoot, 'private'), { recursive: true })
  await writeFile(path.join(vaultRoot, 'shared', 'image.png'), Buffer.from([1, 2, 3]))
  await writeFile(path.join(vaultRoot, 'private', 'secret.png'), Buffer.from([4, 5, 6]))
  process.env.KNOWLEDGE_PATH = vaultRoot
  process.env.NABU_DATA_PATH = dataRoot
  process.env.NABU_PASSWORD = 'test-password'
  __resetSharedSpaceServiceForTests()
  __resetVaultServiceForTests()
}

async function publicPrincipal() {
  const service = new SharedSpaceService({ now: () => 1_000, baseUrl: 'http://localhost:3000' })
  const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'shared' })
  const confirmed = await service.confirmSharedSpace({
    ownerPrincipalId: 'owner',
    proposalId: proposal.proposalId,
    confirmed: true,
  })
  const space = await service.issueReadLink({
    ownerPrincipalId: 'owner',
    sharedSpaceId: confirmed.sharedSpaceId,
  })
  return resolveVaultPrincipal(new Request(space.shareUrl), 1_000)
}

describe('vault asset responses', () => {
  it('serves an in-scope asset without exposing the filesystem path', async () => {
    await fixture()
    const principal = await publicPrincipal()
    const response = await getVaultAssetResponse('shared/image.png', principal ?? undefined)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('returns the same unavailable response for out-of-scope and missing assets', async () => {
    await fixture()
    const principal = await publicPrincipal()

    const outside = await getVaultAssetResponse('private/secret.png', principal ?? undefined)
    const missing = await getVaultAssetResponse('shared/missing.png', principal ?? undefined)

    expect(outside.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await outside.json()).toEqual({ error: 'Shared space unavailable' })
    expect(await missing.json()).toEqual({ error: 'Shared space unavailable' })
  })

  it('rejects NUL-byte asset paths with the generic unavailable response', async () => {
    await fixture()
    const principal = await publicPrincipal()
    const response = await getVaultAssetResponse('shared/\0secret.png', principal ?? undefined)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Shared space unavailable' })
  })
})
