import { describe, expect, it } from 'vitest'
import { getAgentBootstrapContract } from '../../../lib/agent/bootstrap'
import { Route } from './bootstrap'

describe('GET /api/agent/bootstrap', () => {
  it('returns the public bootstrap contract without requiring authentication', async () => {
    const handler = Route.options.server.handlers.GET
    const response = await handler({
      request: new Request('http://localhost:3000/api/agent/bootstrap'),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual(getAgentBootstrapContract())
  })
})
