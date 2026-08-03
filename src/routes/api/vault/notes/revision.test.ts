import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SharedSpaceService, __resetSharedSpaceServiceForTests } from '../../../../lib/shared-spaces/service'
import { __resetVaultServiceForTests } from '../../../../lib/vault/service'
import { Route } from './by-path'

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

describe('revision-aware note route', () => {
  it('accepts the read ETag through If-Match for shared-token writes', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-revision-route-vault-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-revision-route-data-'))
    roots.push(vaultRoot, dataRoot)
    await mkdir(path.join(vaultRoot, 'little-helpers'), { recursive: true })
    await writeFile(path.join(vaultRoot, 'little-helpers', 'note.md'), '# Before')
    process.env.KNOWLEDGE_PATH = vaultRoot
    process.env.NABU_DATA_PATH = dataRoot
    process.env.NABU_PASSWORD = 'test-password'
    __resetSharedSpaceServiceForTests()
    __resetVaultServiceForTests()

    const now = Date.now()
    const service = new SharedSpaceService({ now: () => now, baseUrl: 'http://localhost:3000' })
    const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'little-helpers' })
    const confirmed = await service.confirmSharedSpace({
      ownerPrincipalId: 'owner',
      proposalId: proposal.proposalId,
      confirmed: true,
      permissions: ['read', 'write'],
    })
    const redeemed = await service.redeemSharedSpaceInvite({ inviteUrl: confirmed.inviteUrl })
    const authHeaders = { authorization: `Bearer ${redeemed.accessToken}` }
    const handlers = Route.options.server!.handlers!

    const read = await handlers.GET({
      request: new Request('http://localhost:3000/api/vault/notes/by-path?path=little-helpers/note.md', {
        headers: authHeaders,
      }),
    })
    const etag = read.headers.get('etag')
    expect(read.status).toBe(200)
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/)

    const missingRevision = await handlers.PUT({
      request: new Request('http://localhost:3000/api/vault/notes/by-path', {
        method: 'PUT',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'little-helpers/note.md', rawMarkdown: '# Missing revision' }),
      }),
    })
    expect(missingRevision.status).toBe(428)
    expect(await missingRevision.json()).toMatchObject({
      code: 'WRITE_REVISION_REQUIRED',
      nextAction: expect.stringContaining('If-Match'),
      readUrl: '/api/vault/notes/by-path?path=little-helpers%2Fnote.md',
    })

    const update = await handlers.PUT({
      request: new Request('http://localhost:3000/api/vault/notes/by-path', {
        method: 'PUT',
        headers: { ...authHeaders, 'content-type': 'application/json', 'if-match': etag! },
        body: JSON.stringify({ path: 'little-helpers/note.md', rawMarkdown: '# After' }),
      }),
    })
    expect(update.status).toBe(200)
    expect((await update.json()).note.body).toBe('# After')
  })
})
