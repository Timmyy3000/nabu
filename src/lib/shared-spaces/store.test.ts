import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { __resetSharedSpaceStoreForTests, getSharedSpaceStore } from './store'

const originalDataPath = process.env.NABU_DATA_PATH
const originalNodeEnv = process.env.NODE_ENV
const tempRoots: string[] = []

async function createDataPath(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nabu-shared-space-store-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  process.env.NABU_DATA_PATH = originalDataPath
  process.env.NODE_ENV = originalNodeEnv
  __resetSharedSpaceStoreForTests()
  await Promise.allSettled(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('shared-space store configuration and persistence', () => {
  it('reopens persisted records from the same data path', async () => {
    process.env.NODE_ENV = 'test'
    process.env.NABU_DATA_PATH = await createDataPath()
    const store = await getSharedSpaceStore()

    store.createProposal({
      id: 'proposal-1',
      ownerPrincipalId: 'owner',
      rootPath: 'projects/allies',
      preview: {
        proposalId: 'proposal-1',
        rootPath: 'projects/allies',
        files: ['projects/allies/readme.md'],
        folders: [],
        fileCount: 1,
        totalBytes: 12,
        warnings: [],
        liveRecursiveScope: true,
        expiresAt: new Date(2_000).toISOString(),
      },
      createdAt: 1_000,
      expiresAt: 2_000,
    })

    __resetSharedSpaceStoreForTests()
    const reopenedStore = await getSharedSpaceStore()

    expect(reopenedStore.getProposal('proposal-1')).toMatchObject({
      id: 'proposal-1',
      rootPath: 'projects/allies',
    })
  })

  it('rejects a relative data path in production', async () => {
    process.env.NODE_ENV = 'production'
    process.env.NABU_DATA_PATH = '.nabu-data'

    await expect(getSharedSpaceStore()).rejects.toThrow('NABU_DATA_PATH must be an absolute path')
  })

  it('rejects a missing data path in production instead of using the container filesystem', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.NABU_DATA_PATH

    await expect(getSharedSpaceStore()).rejects.toThrow('NABU_DATA_PATH is required in production')
  })
})
