import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AUTH_COOKIE_NAME, createSessionToken } from '../lib/auth/session'
import { Route } from './agents[.]md'

const ORIGINAL_NABU_PASSWORD = process.env.NABU_PASSWORD

beforeEach(() => {
  process.env.NABU_PASSWORD = 'test-password'
})

afterEach(() => {
  process.env.NABU_PASSWORD = ORIGINAL_NABU_PASSWORD
})

describe('GET /agents.md', () => {
  it('returns a raw markdown bootstrap contract when unauthenticated', async () => {
    const handler = Route.options.server.handlers.GET
    const response = await handler({
      request: new Request('http://localhost:3000/agents.md'),
    })
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(body).toContain('# /agents.md')
    expect(body).toContain('POST /api/auth/login')
    expect(body).toContain('Use `rawMarkdown`, not `body` or `content`.')
    expect(body).not.toContain('<html')
    expect(body).not.toContain('docs-surface')
  })

  it('returns the full authenticated contract in raw markdown when authenticated', async () => {
    const handler = Route.options.server.handlers.GET
    const session = createSessionToken()
    const response = await handler({
      request: new Request('http://localhost:3000/agents.md', {
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(session)}`,
        },
      }),
    })
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(body).toContain('PATCH /api/vault/notes/by-path')
    expect(body).toContain('DELETE /api/vault/notes/by-path?path=')
    expect(body).toContain('DELETE /api/vault/folders?path=')
    expect(body).toContain('Use `rawMarkdown`, not `body` or `content`.')
    expect(body).toContain('Folder delete is empty-only and non-recursive.')
    expect(body).not.toContain('<html')
  })
})
