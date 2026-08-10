import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AUTH_COOKIE_NAME, createSessionToken } from '../../../lib/auth/session'
import { __resetSharedSpaceServiceForTests } from '../../../lib/shared-spaces/service'
import { __resetSharedSpaceStoreForTests } from '../../../lib/shared-spaces/store'
import { Route as IssueRoute } from './connections/index'
import { Route as RedeemRoute } from './connections/redeem'

const originalDataPath = process.env.NABU_DATA_PATH
const originalPassword = process.env.NABU_PASSWORD
const originalPublicUrl = process.env.NABU_PUBLIC_URL
const originalNodeEnv = process.env.NODE_ENV
const roots: string[] = []

type PostHandler = (input: { request: Request }) => Promise<Response>

function postHandler(route: { options: { server?: { handlers?: unknown } } }): PostHandler {
  return (route.options.server?.handlers as { POST: PostHandler }).POST
}

afterEach(async () => {
  process.env.NABU_DATA_PATH = originalDataPath
  process.env.NABU_PASSWORD = originalPassword
  process.env.NABU_PUBLIC_URL = originalPublicUrl
  process.env.NODE_ENV = originalNodeEnv
  __resetSharedSpaceStoreForTests()
  __resetSharedSpaceServiceForTests()
  await Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

async function fixture() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-agent-connection-route-'))
  roots.push(dataRoot)
  process.env.NABU_DATA_PATH = dataRoot
  process.env.NABU_PASSWORD = 'test-password'
  process.env.NABU_PUBLIC_URL = 'https://nabu.example/base'
  process.env.NODE_ENV = 'test'
  __resetSharedSpaceStoreForTests()
}

function ownerRequest(body: unknown): Request {
  return new Request('https://nabu.example/base/api/agent/connections', {
    method: 'POST',
    headers: {
      cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(createSessionToken())}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('owner agent connection HTTP API', () => {
  it('requires a human owner session to issue a connection', async () => {
    await fixture()
    const handler = postHandler(IssueRoute)

    const response = await handler({ request: new Request('https://nabu.example/base/api/agent/connections', { method: 'POST' }) })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('issues a permission-bound one-time link without returning a durable credential', async () => {
    await fixture()
    const handler = postHandler(IssueRoute)

    const response = await handler({ request: ownerRequest({ permissions: ['read'] }) })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(body).toMatchObject({
      permissions: ['read'],
      redemption: {
        endpoint: '/base/api/agent/connections/redeem',
        bodyField: 'connectionUrl',
      },
    })
    expect(body.connectionUrl).toMatch(/^https:\/\/nabu\.example\/base\/connect\/agent\//)
    expect(body.credential).toBeUndefined()
  })

  it('redeems once and returns a private durable credential response', async () => {
    await fixture()
    const issueHandler = postHandler(IssueRoute)
    const redeemHandler = postHandler(RedeemRoute)
    const issued = await issueHandler({ request: ownerRequest({ permissions: ['read', 'write'] }) })
    const issuedBody = await issued.json()

    const first = await redeemHandler({
      request: new Request('https://nabu.example/base/api/agent/connections/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionUrl: issuedBody.connectionUrl }),
      }),
    })
    const firstBody = await first.json()

    expect(first.status).toBe(200)
    expect(first.headers.get('Cache-Control')).toBe('no-store')
    expect(first.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(firstBody).toMatchObject({ permissions: ['read', 'write'], nextAction: 'configure_agent' })
    expect(firstBody.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(firstBody.credential).toMatch(/^[A-Za-z0-9_-]{40,}$/)

    const second = await redeemHandler({
      request: new Request('https://nabu.example/base/api/agent/connections/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionUrl: issuedBody.connectionUrl }),
      }),
    })

    expect(second.status).toBe(410)
    expect(await second.json()).toEqual({
      error: 'The agent connection is invalid or expired.',
      code: 'AGENT_CONNECTION_INVALID',
    })
  })

  it('rejects invalid request bodies without consuming a link', async () => {
    await fixture()
    const issueHandler = postHandler(IssueRoute)
    const redeemHandler = postHandler(RedeemRoute)
    const issued = await issueHandler({ request: ownerRequest({ permissions: ['read'] }) })
    const issuedBody = await issued.json()

    const malformed = await redeemHandler({
      request: new Request('https://nabu.example/base/api/agent/connections/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    })
    expect(malformed.status).toBe(400)

    const valid = await redeemHandler({
      request: new Request('https://nabu.example/base/api/agent/connections/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ connectionUrl: issuedBody.connectionUrl }),
      }),
    })
    expect(valid.status).toBe(200)
  })
})
