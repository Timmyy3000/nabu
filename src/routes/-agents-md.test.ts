import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AUTH_COOKIE_NAME, createSessionToken } from '../lib/auth/session'
import { Route } from './agents[.]md'

const ORIGINAL_NABU_PASSWORD = process.env.NABU_PASSWORD
const ORIGINAL_PUBLIC_URL = process.env.NABU_PUBLIC_URL

beforeEach(() => {
  process.env.NABU_PASSWORD = 'test-password'
})

afterEach(() => {
  if (ORIGINAL_NABU_PASSWORD === undefined) delete process.env.NABU_PASSWORD
  else process.env.NABU_PASSWORD = ORIGINAL_NABU_PASSWORD
  if (ORIGINAL_PUBLIC_URL === undefined) delete process.env.NABU_PUBLIC_URL
  else process.env.NABU_PUBLIC_URL = ORIGINAL_PUBLIC_URL
})

describe('GET /agents.md', () => {
  it('returns the complete raw markdown contract without authentication', async () => {
    process.env.NABU_PUBLIC_URL = 'https://nabu.timi.click'
    const handler = Route.options.server.handlers.GET
    const response = await handler({
      request: new Request('https://nabu.timi.click/agents.md'),
    })
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(body).toContain('# /agents.md')
    expect(body).toContain('POST /api/auth/login')
    expect(body).toContain('Read this route before touching the browser UI.')
    expect(body).toContain('Do not use browser automation or browser-use for normal note operations.')
    expect(body).toContain('https://nabu.timi.click/api/auth/login')
    expect(body).toContain('Use `rawMarkdown`, not top-level `body` or `content`.')
    expect(body).toContain('The JSON field is exactly `inviteUrl`')
    expect(body).toContain('410 SHARED_SPACE_INVITE_INVALID')
    expect(body).toContain('If the deployment runs multiple instances')
    expect(body).toContain('PATCH /api/vault/notes/by-path')
    expect(body).not.toContain('<html')
    expect(body).not.toContain('docs-surface')
  })

  it('returns the same complete contract when authenticated', async () => {
    process.env.NABU_PUBLIC_URL = 'https://nabu.timi.click'
    const handler = Route.options.server.handlers.GET
    const session = createSessionToken()
    const response = await handler({
      request: new Request('https://nabu.timi.click/agents.md', {
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
    expect(body).toContain('Use deterministic by-path reads after every mutation.')
    expect(body).toContain('https://nabu.timi.click/api/vault/notes/by-path?path=projects%2Fexample%2Fnotes%2Fexample.md')
    expect(body).toContain('When writing notes, prefer canonical frontmatter metadata')
    expect(body).toContain('Use `rawMarkdown`, not top-level `body` or `content`.')
    expect(body).toContain('The JSON field is exactly `inviteUrl`')
    expect(body).toContain('Folder delete is empty-only and non-recursive.')
    expect(body).not.toContain('<html')
  })

  it('uses the configured canonical base when the request origin is hostile', async () => {
    process.env.NABU_PUBLIC_URL = 'https://trusted.example/base'
    const handler = Route.options.server.handlers.GET
    const response = await handler({
      request: new Request('https://evil.example/agents.md'),
    })
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('https://trusted.example/base/api/auth/login')
    expect(body).not.toContain('https://evil.example/api/auth/login')
  })
})
