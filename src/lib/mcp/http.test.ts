import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deriveAgentCredential } from '../auth/agent-credential'
import { SharedSpaceService, __resetSharedSpaceServiceForTests } from '../shared-spaces/service'
import { handleMcpRequest } from './http'

const originalDataPath = process.env.NABU_DATA_PATH
const originalKnowledgePath = process.env.KNOWLEDGE_PATH
const originalPassword = process.env.NABU_PASSWORD
const originalNodeEnv = process.env.NODE_ENV
const originalPublicUrl = process.env.NABU_PUBLIC_URL
const tempRoots: string[] = []

afterEach(async () => {
  process.env.NABU_DATA_PATH = originalDataPath
  process.env.KNOWLEDGE_PATH = originalKnowledgePath
  process.env.NABU_PASSWORD = originalPassword
  process.env.NODE_ENV = originalNodeEnv
  if (originalPublicUrl === undefined) delete process.env.NABU_PUBLIC_URL
  else process.env.NABU_PUBLIC_URL = originalPublicUrl
  __resetSharedSpaceServiceForTests()
  await Promise.allSettled(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

async function fixture(): Promise<void> {
  const knowledgePath = await mkdtemp(path.join(os.tmpdir(), 'nabu-mcp-http-vault-'))
  const dataPath = await mkdtemp(path.join(os.tmpdir(), 'nabu-mcp-http-data-'))
  tempRoots.push(knowledgePath, dataPath)
  await mkdir(path.join(knowledgePath, 'shared'), { recursive: true })
  await writeFile(path.join(knowledgePath, 'shared', 'readme.md'), '# Shared')
  await writeFile(path.join(knowledgePath, 'private.md'), '# Private')
  process.env.KNOWLEDGE_PATH = knowledgePath
  process.env.NABU_DATA_PATH = dataPath
  process.env.NABU_PASSWORD = 'test-password'
  process.env.NODE_ENV = 'test'
  delete process.env.NABU_PUBLIC_URL
  __resetSharedSpaceServiceForTests()
}

function request(body: unknown, headers: Record<string, string> = {}, url = 'http://localhost:3000/mcp'): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

async function readJsonRpc(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  const body = response.headers.get('content-type')?.includes('text/event-stream')
    ? text.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice('data:'.length).trim() ?? '{}'
    : text
  return JSON.parse(body) as Record<string, unknown>
}

async function listTools(headers: Record<string, string> = {}): Promise<string[]> {
  const response = await handleMcpRequest(request({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, headers))
  const payload = await readJsonRpc(response) as { result?: { tools?: Array<{ name: string }> } }
  return payload.result?.tools?.map((tool) => tool.name) ?? []
}

async function sharedAccessToken(permissions: Array<'read' | 'write'>): Promise<string> {
  const service = new SharedSpaceService({ baseUrl: 'http://localhost:3000' })
  const proposal = await service.proposeSharedSpace({
    ownerPrincipalId: 'owner',
    path: 'shared',
    permissions,
    contractVersion: 2,
    durationDays: 7,
  })
  const invite = await service.confirmSharedSpace({
    ownerPrincipalId: 'owner',
    proposalId: proposal.proposalId,
    confirmed: true,
    permissions,
    durationDays: 7,
    contractVersion: 2,
    path: 'shared',
  })
  const redeemed = await service.redeemSharedSpaceInvite({ inviteUrl: invite.inviteUrl })
  return redeemed.accessToken
}

describe('native MCP HTTP authentication', () => {
  it('exposes only invite redemption without a bearer credential', async () => {
    await fixture()

    await expect(listTools({ cookie: 'nabu_session=browser-session' })).resolves.toEqual(['redeem_shared_space_invite'])
  })

  it('rejects invalid bearer credentials instead of downgrading to bootstrap', async () => {
    await fixture()

    const response = await handleMcpRequest(request(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { authorization: 'Bearer invalid-token', cookie: 'nabu_session=valid-looking-cookie' },
    ))

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer\b/)
  })

  it('uses the durable owner bearer credential across the full owner surface', async () => {
    await fixture()

    const tools = await listTools({ authorization: `Bearer ${deriveAgentCredential('test-password')}` })

    expect(tools).toContain('propose_shared_space')
    expect(tools).toContain('create_note')
    expect(tools).toContain('redeem_shared_space_invite')
  })

  it('selects read-only and read-write surfaces from the redeemed token scope', async () => {
    await fixture()
    const readToken = await sharedAccessToken(['read'])
    const writeToken = await sharedAccessToken(['read', 'write'])

    const readTools = await listTools({ authorization: `Bearer ${readToken}` })
    const writeTools = await listTools({ authorization: `Bearer ${writeToken}` })

    expect(readTools).toContain('read_note')
    expect(readTools).not.toContain('create_note')
    expect(readTools).not.toContain('list_shared_spaces')
    expect(writeTools).toContain('create_note')
    expect(writeTools).not.toContain('list_shared_spaces')
  })

  it('passes the shared principal into real reads and keeps private paths unavailable', async () => {
    await fixture()
    const accessToken = await sharedAccessToken(['read'])
    const headers = { authorization: `Bearer ${accessToken}` }

    const allowed = await handleMcpRequest(request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'read_note', arguments: { path: 'shared/readme.md' } },
    }, headers))
    const denied = await handleMcpRequest(request({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'read_note', arguments: { path: 'private.md' } },
    }, headers))
    const allowedPayload = await readJsonRpc(allowed)
    const deniedPayload = await readJsonRpc(denied)

    expect((allowedPayload.result as { structuredContent?: { note?: { relPath?: string } } }).structuredContent?.note?.relPath)
      .toBe('shared/readme.md')
    expect((deniedPayload.result as { isError?: boolean }).isError).toBe(true)
  })

  it('rejects mismatched origin and host before MCP dispatch', async () => {
    await fixture()

    const originMismatch = await handleMcpRequest(request(
      { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      { origin: 'https://evil.example' },
    ))
    const hostMismatch = await handleMcpRequest(new Request('http://localhost:3000/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        host: 'evil.example',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    }))

    expect(originMismatch.status).toBe(403)
    expect(hostMismatch.status).toBe(403)
  })

  it('serves the owner surface through the official Streamable HTTP client', async () => {
    await fixture()
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      handleMcpRequest(new Request(input, init))
    const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
      fetch: fetchFn,
      requestInit: {
        headers: {
          authorization: `Bearer ${deriveAgentCredential('test-password')}`,
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
        },
      },
    })
    const client = new Client({ name: 'nabu-http-test', version: '1.0.0' })

    await client.connect(transport)
    const tools = await client.listTools()

    expect(tools.tools.map((tool) => tool.name)).toContain('propose_shared_space')
    await client.close()
  })
})
