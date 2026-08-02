import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { resolveVaultPrincipal } from '../auth/authorization'
import { SharedSpaceService, __resetSharedSpaceServiceForTests } from '../shared-spaces/service'
import { hashVaultRawMarkdown } from './content-hash'
import {
  createVaultNote,
  getVaultNoteByPathResponse,
  getVaultNoteNeighborhoodResponse,
  getVaultFolderListingResponse,
  getVaultTreeResponse,
  updateVaultNoteByPathResponse,
  __resetVaultServiceForTests,
} from './service'

const originalKnowledgePath = process.env.KNOWLEDGE_PATH
const originalDataPath = process.env.NABU_DATA_PATH
const originalPassword = process.env.NABU_PASSWORD
const originalRequireRevision = process.env.NABU_REQUIRE_WRITE_REVISION
const roots: string[] = []

afterEach(async () => {
  process.env.KNOWLEDGE_PATH = originalKnowledgePath
  process.env.NABU_DATA_PATH = originalDataPath
  process.env.NABU_PASSWORD = originalPassword
  process.env.NABU_REQUIRE_WRITE_REVISION = originalRequireRevision
  __resetSharedSpaceServiceForTests()
  __resetVaultServiceForTests()
  await Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

async function fixture() {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-shared-vault-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-shared-data-'))
  roots.push(vaultRoot, dataRoot)
  await mkdir(path.join(vaultRoot, 'little-helpers'), { recursive: true })
  await writeFile(path.join(vaultRoot, 'little-helpers', 'shared.md'), '# Shared\n\n[[private.md]]')
  await writeFile(path.join(vaultRoot, 'private.md'), '# Private\n\n[[little-helpers/shared.md]]')
  process.env.KNOWLEDGE_PATH = vaultRoot
  process.env.NABU_DATA_PATH = dataRoot
  process.env.NABU_PASSWORD = 'test-password'
  __resetSharedSpaceServiceForTests()
  __resetVaultServiceForTests()
  return vaultRoot
}

async function sharedPrincipal(permissions: ['read'] | ['read', 'write'] = ['read', 'write']) {
  const service = new SharedSpaceService({ now: () => 1_000, baseUrl: 'http://localhost:3000' })
  const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
  const confirmation = await service.confirmSharedSpace({
    ownerPrincipalId: 'owner',
    proposalId: proposal.proposalId,
    confirmed: true,
    permissions,
  })
  const redeemed = await service.redeemSharedSpaceInvite({ inviteUrl: confirmation.inviteUrl })
  return resolveVaultPrincipal(
    new Request('http://localhost:3000', { headers: { authorization: `Bearer ${redeemed.accessToken}` } }),
    1_000,
  )
}

describe('shared vault access', () => {
  it('filters private paths and links while exposing the live recursive root', async () => {
    await fixture()
    const principal = await sharedPrincipal()
    expect(principal?.kind).toBe('shared')

    const tree = await getVaultTreeResponse(principal ?? undefined)
    const treePayload = await tree.json()
    expect(treePayload.tree.path).toBe('little-helpers')
    expect(JSON.stringify(treePayload)).not.toContain('private.md')

    const neighborhood = await getVaultNoteNeighborhoodResponse('little-helpers/shared.md', principal ?? undefined)
    const neighborhoodPayload = await neighborhood.json()
    expect(neighborhood.status).toBe(200)
    expect(neighborhoodPayload.backlinks).toEqual([])
    expect(neighborhoodPayload.outgoing).toEqual([])
    expect(neighborhoodPayload.unresolvedOutgoing).toEqual([])

    await writeFile(path.join(process.env.KNOWLEDGE_PATH!, 'little-helpers', 'nested.md'), '# Nested')
    const liveTree = await getVaultTreeResponse(principal ?? undefined)
    expect((await liveTree.json()).tree.directNoteCount).toBe(2)
    const liveFolder = await getVaultFolderListingResponse('little-helpers', principal ?? undefined)
    expect(JSON.stringify(await liveFolder.json())).toContain('nested.md')
  })

  it('returns a machine-readable migration warning for legacy owner writes', async () => {
    await fixture()
    const response = await updateVaultNoteByPathResponse({
      path: 'private.md',
      rawMarkdown: '# Updated',
    })
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(payload.migration).toMatchObject({
      code: 'WRITE_REVISION_MIGRATION_REQUIRED',
      nextAction: expect.stringContaining('expectedRevision'),
    })
    expect(response.headers.get('etag')).toBe(`"${hashVaultRawMarkdown('# Updated')}"`)
  })

  it('requires and validates revisions for shared-token updates', async () => {
    const vaultRoot = await fixture()
    const principal = await sharedPrincipal()
    expect(principal?.kind).toBe('shared')

    const read = await getVaultNoteByPathResponse('little-helpers/shared.md', principal ?? undefined)
    const readPayload = await read.json()
    const revision = readPayload.note.revision as string
    expect(read.headers.get('etag')).toBe(`"${revision}"`)

    const missing = await updateVaultNoteByPathResponse({
      path: 'little-helpers/shared.md',
      rawMarkdown: '# Missing precondition',
      principal: principal ?? undefined,
    })
    expect(missing.status).toBe(428)
    expect(await missing.json()).toMatchObject({
      code: 'WRITE_REVISION_REQUIRED',
      nextAction: expect.stringContaining('expectedRevision'),
      readUrl: '/api/vault/notes/by-path?path=little-helpers%2Fshared.md',
    })

    await writeFile(path.join(vaultRoot, 'little-helpers', 'shared.md'), '# External change')
    const stale = await updateVaultNoteByPathResponse({
      path: 'little-helpers/shared.md',
      rawMarkdown: '# Stale write',
      expectedRevision: revision,
      principal: principal ?? undefined,
    })
    expect(stale.status).toBe(409)
    const stalePayload = await stale.json()
    expect(stalePayload).toMatchObject({
      code: 'STALE_NOTE_REVISION',
      currentRevision: hashVaultRawMarkdown('# External change'),
    })

    const fresh = await updateVaultNoteByPathResponse({
      path: 'little-helpers/shared.md',
      rawMarkdown: '# Fresh write',
      expectedRevision: hashVaultRawMarkdown('# External change'),
      principal: principal ?? undefined,
    })
    expect(fresh.status).toBe(200)
  })

  it('can switch owner writes to strict revision enforcement after migration', async () => {
    await fixture()
    process.env.NABU_REQUIRE_WRITE_REVISION = 'true'
    const response = await updateVaultNoteByPathResponse({
      path: 'private.md',
      rawMarkdown: '# Strict owner write',
    })
    expect(response.status).toBe(428)
    expect((await response.json()).code).toBe('WRITE_REVISION_REQUIRED')
  })

  it('denies parent and sibling paths without revealing their contents', async () => {
    await fixture()
    const principal = await sharedPrincipal()
    const response = await getVaultNoteByPathResponse('private.md', principal ?? undefined)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'The requested vault resource is not available.' })
  })

  it('allows collaborators to create descendants that the owner can read', async () => {
    await fixture()
    const principal = await sharedPrincipal()
    await createVaultNote({
      path: 'little-helpers/created-by-collaborator.md',
      rawMarkdown: '# Collaborator note',
      principal: principal ?? undefined,
    })

    const ownerRead = await getVaultNoteByPathResponse('little-helpers/created-by-collaborator.md')
    expect(ownerRead.status).toBe(200)
    expect((await ownerRead.json()).note.body).toBe('# Collaborator note')
  })

  it('enforces read-only shared-space permissions on writes', async () => {
    await fixture()
    const principal = await sharedPrincipal(['read'])
    const response = await updateVaultNoteByPathResponse({
      path: 'little-helpers/shared.md',
      rawMarkdown: '# Not allowed',
      principal: principal ?? undefined,
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'The requested vault resource is not available.',
    })
  })
})
