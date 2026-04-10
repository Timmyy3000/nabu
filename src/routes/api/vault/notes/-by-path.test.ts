import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createSessionToken, AUTH_COOKIE_NAME } from '../../../../lib/auth/session'
import { __resetVaultServiceForTests } from '../../../../lib/vault/service'
import { Route } from './by-path'

const ORIGINAL_KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH
const ORIGINAL_NABU_PASSWORD = process.env.NABU_PASSWORD
const tempRoots: string[] = []

async function createVaultFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-notes-by-path-route-'))
  tempRoots.push(root)

  await Promise.all(
    Object.entries(files).map(async ([relPath, content]) => {
      const absPath = path.join(root, relPath)
      await mkdir(path.dirname(absPath), { recursive: true })
      await writeFile(absPath, content)
    }),
  )

  process.env.KNOWLEDGE_PATH = root
  process.env.NABU_PASSWORD = 'test-password'
  __resetVaultServiceForTests()
}

afterEach(async () => {
  process.env.KNOWLEDGE_PATH = ORIGINAL_KNOWLEDGE_PATH
  process.env.NABU_PASSWORD = ORIGINAL_NABU_PASSWORD
  __resetVaultServiceForTests()

  await Promise.allSettled(tempRoots.map(async (root) => rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('GET /api/vault/notes/by-path', () => {
  it('returns 401 when request is unauthenticated', async () => {
    await createVaultFixture({
      'projects/nabu/roadmap.md': '# Roadmap',
    })

    const handler = Route.options.server.handlers.GET
    const response = await handler({
      request: new Request('http://localhost:3000/api/vault/notes/by-path?path=projects/nabu/roadmap.md'),
    })
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('returns note payload when request is authenticated', async () => {
    await createVaultFixture({
      'projects/nabu/roadmap.md': '# Roadmap',
    })

    const handler = Route.options.server.handlers.GET
    const session = createSessionToken()
    const response = await handler({
      request: new Request('http://localhost:3000/api/vault/notes/by-path?path=projects/nabu/roadmap.md', {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(session)}`,
        },
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      builtAt: expect.any(String),
      note: {
        relPath: 'projects/nabu/roadmap.md',
        slug: 'roadmap',
      },
    })
  })

  it('returns 400 for invalid path input when request is authenticated', async () => {
    await createVaultFixture({
      'projects/nabu/roadmap.md': '# Roadmap',
    })

    const handler = Route.options.server.handlers.GET
    const session = createSessionToken()
    const response = await handler({
      request: new Request('http://localhost:3000/api/vault/notes/by-path?path=../secrets.md', {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(session)}`,
        },
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({
      error: 'Invalid note path',
      path: '../secrets.md',
    })
  })
})
