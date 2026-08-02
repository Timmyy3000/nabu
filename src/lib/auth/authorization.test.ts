import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { OWNER_VAULT_PRINCIPAL, assertVaultPathAccess, isVaultPathInScope, resolveVaultPrincipal } from './authorization'
import { hashSecret } from '../shared-spaces/crypto'
import { SharedSpaceService, __resetSharedSpaceServiceForTests } from '../shared-spaces/service'

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
})

