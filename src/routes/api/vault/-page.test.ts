import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { SharedSpaceService, __resetSharedSpaceServiceForTests } from '../../../lib/shared-spaces/service'
import { AUTH_COOKIE_NAME, createSessionToken } from '../../../lib/auth/session'
import { __resetVaultServiceForTests } from '../../../lib/vault/service'
import { Route } from './page'

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
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-page-vault-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-page-data-'))
  roots.push(vaultRoot, dataRoot)
  await mkdir(path.join(vaultRoot, 'shared', 'docs'), { recursive: true })
  await writeFile(path.join(vaultRoot, 'shared', 'index.md'), '# Shared Index\n\n[[docs/guide]]')
  await writeFile(path.join(vaultRoot, 'shared', 'docs', 'guide.md'), '---\ntags: [guide]\n---\n# Shared Guide')
  await writeFile(path.join(vaultRoot, 'private.md'), '# Private Secret')
  process.env.KNOWLEDGE_PATH = vaultRoot
  process.env.NABU_DATA_PATH = dataRoot
  process.env.NABU_PASSWORD = 'test-password'
  __resetSharedSpaceServiceForTests()
  __resetVaultServiceForTests()

  const service = new SharedSpaceService({ now: () => Date.now(), baseUrl: 'http://localhost:3000' })
  const proposal = await service.proposeSharedSpace({ ownerPrincipalId: 'owner', path: 'shared' })
  const confirmed = await service.confirmSharedSpace({
    ownerPrincipalId: 'owner',
    proposalId: proposal.proposalId,
    confirmed: true,
    permissions: ['read', 'write'],
  })
  const readLink = await service.issueReadLink({ ownerPrincipalId: 'owner', sharedSpaceId: confirmed.sharedSpaceId })
  return { token: new URL(readLink.shareUrl).searchParams.get('token')! }
}

function pageRequest(body: unknown, options: { queryToken?: string; owner?: boolean } = {}) {
  const url = new URL('http://localhost:3000/api/vault/page')
  if (options.queryToken) {
    url.searchParams.set('token', options.queryToken)
  }
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (options.owner) {
    headers.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(createSessionToken())}`
  }
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) })
}

function expectPrivateHeaders(response: Response) {
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.get('referrer-policy')).toBe('no-referrer')
}

describe('POST /api/vault/page', () => {
  it('returns scoped browse and search data from a body read-link token', async () => {
    const { token } = await fixture()
    const response = await Route.options.server.handlers.POST({ request: pageRequest({
      token,
      folder: 'shared/docs',
      note: 'guide',
      q: 'guide',
      searchPath: 'shared',
      searchTag: 'guide',
    }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expectPrivateHeaders(response)
    expect(payload.browse).toMatchObject({
      folder: { path: 'shared/docs' },
      note: { relPath: 'shared/docs/guide.md' },
    })
    expect(payload.search).toMatchObject({ total: 1, results: [{ relPath: 'shared/docs/guide.md' }] })
    expect(JSON.stringify(payload)).not.toContain('private.md')
  })

  it('rejects query-only, malformed, oversized, and unknown input with private generic errors', async () => {
    const { token } = await fixture()
    const bodies = [
      { folder: 'shared', note: '', q: '', searchPath: '', searchTag: '' },
      { token, folder: 'shared', note: '', q: '', searchPath: '', searchTag: '', unknown: true },
      { token, folder: 'x'.repeat(2_000), note: '', q: '', searchPath: '', searchTag: '' },
    ]

    for (const body of bodies) {
      const response = await Route.options.server.handlers.POST({
        request: pageRequest(body, { queryToken: token }),
      })
      expect(response.status).toBe(400)
      expectPrivateHeaders(response)
      expect(await response.json()).toEqual({ error: 'Invalid request' })
    }
  })

  it('rejects stale tokens generically with private headers', async () => {
    await fixture()
    const response = await Route.options.server.handlers.POST({ request: pageRequest({
      token: 'x'.repeat(43),
      folder: 'shared',
      note: '',
      q: '',
      searchPath: '',
      searchTag: '',
    }) })

    expect(response.status).toBe(401)
    expectPrivateHeaders(response)
    expect(await response.json()).toEqual({ error: 'Shared space unavailable' })
  })

  it('does not let an owner cookie widen a valid public token beyond its scope', async () => {
    const { token } = await fixture()
    const response = await Route.options.server.handlers.POST({ request: pageRequest({
      token,
      folder: 'private',
      note: 'private',
      q: '',
      searchPath: '',
      searchTag: '',
    }, { owner: true }) })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expectPrivateHeaders(response)
    expect(payload).toEqual({ error: 'Shared space unavailable' })
    expect(JSON.stringify(payload)).not.toContain('private.md')
  })
})
