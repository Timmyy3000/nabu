import { describe, expect, it } from 'vitest'
import { Route } from './agents[.]md'

describe('GET /agents.md', () => {
  it('returns the vendored Nabu skill without authentication', async () => {
    const handler = Route.options.server.handlers.GET
    const response = await handler({
      request: new Request('https://deployment-a.example/agents.md'),
    })
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/markdown')
    expect(body).toContain('# Nabu agent contract')
    expect(body).toContain('/api/shared-spaces/invites/redeem')
    expect(body).toContain('approved credential store')
    expect(body).not.toContain('name: nabu')
    expect(body).not.toContain('little-helpers')
    expect(body).not.toContain('<html')
  })

  it('returns the same skill contract regardless of authentication or host', async () => {
    const handler = Route.options.server.handlers.GET
    const unauthenticated = await handler({
      request: new Request('https://deployment-a.example/agents.md'),
    })
    const authenticated = await handler({
      request: new Request('https://deployment-b.example/agents.md', {
        headers: { cookie: 'nabu_session=not-needed-for-public-contract' },
      }),
    })

    expect(await authenticated.text()).toBe(await unauthenticated.text())
  })
})
