import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createSessionToken, AUTH_COOKIE_NAME } from '../../../../lib/auth/session'
import { __resetVaultServiceForTests } from '../../../../lib/vault/service'
import { Route } from './index'

const ORIGINAL_KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH
const ORIGINAL_NABU_PASSWORD = process.env.NABU_PASSWORD
const tempRoots: string[] = []

async function createVaultFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-notes-route-'))
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
  vi.useRealTimers()
  process.env.KNOWLEDGE_PATH = ORIGINAL_KNOWLEDGE_PATH
  process.env.NABU_PASSWORD = ORIGINAL_NABU_PASSWORD
  __resetVaultServiceForTests()

  await Promise.allSettled(tempRoots.map(async (root) => rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('POST /api/vault/notes', () => {
  it('returns 401 when request is unauthenticated', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const handler = Route.options.server.handlers.POST
    const response = await handler({
      request: new Request('http://localhost:3000/api/vault/notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: 'projects/nabu/specs/agent-operability',
          rawMarkdown: '# Agent Operability',
        }),
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('creates note payload when request is authenticated', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const handler = Route.options.server.handlers.POST
    const session = createSessionToken()
    const response = await handler({
      request: new Request('http://localhost:3000/api/vault/notes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(session)}`,
        },
        body: JSON.stringify({
          path: 'projects/nabu/specs/agent-operability',
          rawMarkdown: '# Agent Operability\n\nWrite surfaces',
        }),
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload).toMatchObject({
      builtAt: expect.any(String),
      created: true,
      note: {
        relPath: 'projects/nabu/specs/agent-operability.md',
      },
    })
  })

  it('creates canonical markdown from structured document input when request is authenticated', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-21T21:30:00.000Z'))

    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const handler = Route.options.server.handlers.POST
    const session = createSessionToken()
    const response = await handler({
      request: new Request('http://localhost:3000/api/vault/notes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(session)}`,
        },
        body: JSON.stringify({
          path: 'resources/leadership/career-cold-start-algorithm',
          document: {
            title: 'Career Cold Start Algorithm',
            summary: 'Fast onboarding framework for new leaders.',
            tags: ['Leadership', 'Onboarding'],
            authors: ['Ivan Landabaso'],
            source: 'https://x.com/example/status/1',
            references: ['projects/nabu/roadmap.md'],
            body: '## Loop\n\n- 25 min learn\n- 3 min challenges\n- 2 min referrals',
          },
        }),
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload).toMatchObject({
      created: true,
      note: {
        relPath: 'resources/leadership/career-cold-start-algorithm.md',
        title: 'Career Cold Start Algorithm',
        summary: 'Fast onboarding framework for new leaders.',
        tags: ['leadership', 'onboarding'],
        authors: ['Ivan Landabaso'],
        source: 'https://x.com/example/status/1',
        references: ['projects/nabu/roadmap.md'],
        createdAt: '2026-04-21T21:30:00.000Z',
        updatedAt: '2026-04-21T21:30:00.000Z',
      },
    })
    expect(payload.note.body).toBe('## Loop\n\n- 25 min learn\n- 3 min challenges\n- 2 min referrals')
    expect(payload.note.frontmatter).toEqual({
      title: 'Career Cold Start Algorithm',
      summary: 'Fast onboarding framework for new leaders.',
      tags: ['leadership', 'onboarding'],
      authors: ['Ivan Landabaso'],
      source: 'https://x.com/example/status/1',
      references: ['projects/nabu/roadmap.md'],
      createdAt: '2026-04-21T21:30:00.000Z',
      updatedAt: '2026-04-21T21:30:00.000Z',
    })
  })

  it('rejects create payloads that send both rawMarkdown and structured document input', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const handler = Route.options.server.handlers.POST
    const session = createSessionToken()
    const response = await handler({
      request: new Request('http://localhost:3000/api/vault/notes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(session)}`,
        },
        body: JSON.stringify({
          path: 'resources/leadership/conflict',
          rawMarkdown: '# Conflict',
          document: {
            title: 'Conflict',
            body: 'Body',
          },
        }),
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({
      error: 'Invalid request body',
    })
  })

  it('rejects create payloads with invalid structured document input', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const handler = Route.options.server.handlers.POST
    const session = createSessionToken()
    const response = await handler({
      request: new Request('http://localhost:3000/api/vault/notes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(session)}`,
        },
        body: JSON.stringify({
          path: 'resources/leadership/bad',
          document: {
            title: 'Bad',
            body: '   ',
          },
        }),
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({
      error: 'Invalid request body',
    })
  })
})
