import { afterEach, describe, expect, it } from 'vitest'
import { Route } from './mcp'

const originalNodeEnv = process.env.NODE_ENV
const originalPublicUrl = process.env.NABU_PUBLIC_URL

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  if (originalPublicUrl === undefined) delete process.env.NABU_PUBLIC_URL
  else process.env.NABU_PUBLIC_URL = originalPublicUrl
})

describe('POST /mcp', () => {
  it('mounts the fetch-compatible native MCP handler', async () => {
    process.env.NODE_ENV = 'test'
    delete process.env.NABU_PUBLIC_URL
    const handler = (Route.options.server!.handlers as unknown as {
      POST: (context: { request: Request }) => Promise<Response>
    }).POST
    const response = await handler({
      request: new Request('http://localhost:3000/mcp', {
        method: 'POST',
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
          host: 'localhost:3000',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/application\/json|text\/event-stream/)
  })
})
