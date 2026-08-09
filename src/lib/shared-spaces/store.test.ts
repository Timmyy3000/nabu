import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { __resetSharedSpaceStoreForTests, getSharedSpaceStore } from './store'
import { hashSecret } from './crypto'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

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

  it('adds v2 proposal and invite replay columns when opening a legacy database', async () => {
    process.env.NODE_ENV = 'test'
    const dataPath = await createDataPath()
    process.env.NABU_DATA_PATH = dataPath
    const db = new DatabaseSync(path.join(dataPath, 'shared-spaces.sqlite'))
    db.exec(`
      CREATE TABLE shared_space_proposals (
        id TEXT PRIMARY KEY,
        owner_principal_id TEXT NOT NULL,
        root_path TEXT NOT NULL,
        preview_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER
      );
      CREATE TABLE shared_space_invites (
        id TEXT PRIMARY KEY,
        shared_space_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        redeemed_at INTEGER,
        redeemed_by_principal_id TEXT
      );
    `)
    db.close()

    await getSharedSpaceStore()
    const migrated = new DatabaseSync(path.join(dataPath, 'shared-spaces.sqlite'))
    const proposalColumns = (migrated.prepare('PRAGMA table_info(shared_space_proposals)').all() as Array<{ name: string }>).map((row) => row.name)
    const inviteColumns = (migrated.prepare('PRAGMA table_info(shared_space_invites)').all() as Array<{ name: string }>).map((row) => row.name)
    migrated.close()
    expect(proposalColumns).toEqual(expect.arrayContaining(['contract_version', 'requested_duration_days', 'requested_permissions_json']))
    expect(inviteColumns).toEqual(expect.arrayContaining(['idempotency_key_hash', 'access_token_hash', 'access_token_id']))
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

  it('rotates one hashed read link row atomically per shared space', async () => {
    process.env.NODE_ENV = 'test'
    process.env.NABU_DATA_PATH = await createDataPath()
    const store = await getSharedSpaceStore()
    const space = {
      id: 'space-1',
      ownerPrincipalId: 'owner',
      rootPath: 'projects/canner',
      permissions: ['read', 'write'] as ['read', 'write'],
      createdAt: 1_000,
      expiresAt: 10_000,
      revokedAt: null,
    }

    store.createProposal({
      id: 'proposal-1',
      ownerPrincipalId: 'owner',
      rootPath: space.rootPath,
      preview: {
        proposalId: 'proposal-1',
        rootPath: space.rootPath,
        files: [],
        folders: [],
        fileCount: 0,
        totalBytes: 0,
        warnings: [],
        liveRecursiveScope: true,
        expiresAt: new Date(2_000).toISOString(),
      },
      createdAt: 1_000,
      expiresAt: 2_000,
    })
    expect(store.consumeProposalAndCreateSpace({
      proposalId: 'proposal-1',
      ownerPrincipalId: 'owner',
      now: 1_000,
      space,
      invite: {
        id: 'invite-1',
        sharedSpaceId: space.id,
        tokenHash: hashSecret('invite-secret'),
        createdAt: 1_000,
        expiresAt: 2_000,
        redeemedAt: null,
        redeemedByPrincipalId: null,
      },
    })).not.toBeNull()

    const first = store.rotateReadLink({
      id: 'read-link-1',
      sharedSpaceId: space.id,
      tokenHash: hashSecret('first-secret'),
      createdAt: 1_000,
      expiresAt: 8_000,
      revokedAt: null,
    })
    const second = store.rotateReadLink({
      id: 'read-link-2',
      sharedSpaceId: space.id,
      tokenHash: hashSecret('second-secret'),
      createdAt: 2_000,
      expiresAt: 9_000,
      revokedAt: null,
    })

    expect(first.tokenHash).toBe(hashSecret('first-secret'))
    expect(store.findReadLink(hashSecret('first-secret'), 2_000)).toBeNull()
    expect(store.findReadLink(hashSecret('second-secret'), 2_000)).toMatchObject({
      id: 'read-link-2',
      sharedSpaceId: space.id,
      rootPath: space.rootPath,
      tokenHash: hashSecret('second-secret'),
    })
    expect(store.getReadLinkForTest(space.id)).toMatchObject({ id: second.id })
  })
})
