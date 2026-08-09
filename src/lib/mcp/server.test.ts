import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { afterEach, describe, expect, it } from 'vitest'
import { createNabuMcpServer } from './server'
import type { KnowledgeGateway } from './gateway'

const AUTO_NEGOTIATION = { versionNegotiation: { mode: 'auto' as const } }
type ClientOptions = NonNullable<ConstructorParameters<typeof Client>[1]>

function createFakeGateway(): KnowledgeGateway {
  return {
    getVaultSummary: async () => ({ stats: { notes: 1 }, folders: [] }),
    searchNotes: async (input) => ({ query: input.query, results: [{ relPath: 'ideas/agent.md' }] }),
    readNote: async (notePath) => ({ note: { relPath: notePath, body: 'agent knowledge' } }),
    listFolder: async (folderPath = '') => ({ path: folderPath, folders: [], notes: [] }),
    getNeighborhood: async (notePath) => ({ note: notePath, related: [] }),
    createNote: async (input) => ({ created: true, path: input.path }),
    updateNote: async (input) => ({ updated: true, path: input.path }),
    moveNote: async (input) => ({ moved: true, fromPath: input.path, toPath: input.toPath }),
    deleteNote: async (notePath) => ({ deleted: true, path: notePath }),
    proposeSharedSpace: async (input) => ({ proposalId: 'proposal_1', ...input }),
    confirmSharedSpace: async (input) => ({ sharedSpaceId: 'space_1', ...input }),
    listSharedSpaces: async () => ({ spaces: [] }),
    getSharedSpace: async (sharedSpaceId) => ({ sharedSpaceId }),
    revokeSharedSpace: async (sharedSpaceId) => ({ sharedSpaceId, revoked: true }),
    redeemSharedSpaceInvite: async (inviteUrl) => ({ inviteUrl, accessToken: 'secret' }),
    createSharedSpaceInvite: async (sharedSpaceId) => ({ sharedSpaceId, inviteUrl: 'invite' }),
    extendSharedSpace: async (input) => ({ ...input, extended: true }),
  }
}

async function connectTestPair(
  server: McpServer,
  options?: ClientOptions,
) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = options
    ? new Client({ name: 'nabu-mcp-test-client', version: '1.0.0' }, options)
    : new Client({ name: 'nabu-mcp-test-client', version: '1.0.0' })

  await server.connect(serverTransport)
  await client.connect(clientTransport)

  return { client, server }
}

describe('Nabu MCP server', () => {
  let connectedServer: McpServer | undefined

  afterEach(async () => {
    await connectedServer?.close()
    connectedServer = undefined
  })

  it('exposes vault traversal and mutation tools through the modern protocol', async () => {
    const pair = await connectTestPair(createNabuMcpServer(createFakeGateway()), AUTO_NEGOTIATION)
    connectedServer = pair.server

    const tools = await pair.client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'get_vault_summary',
      'search_notes',
      'read_note',
      'list_folder',
      'get_neighborhood',
      'create_note',
      'update_note',
      'move_note',
      'delete_note',
      'propose_shared_space',
      'confirm_shared_space',
      'list_shared_spaces',
      'get_shared_space',
      'revoke_shared_space',
      'redeem_shared_space_invite',
      'create_shared_space_invite',
      'extend_shared_space',
    ])

    const result = await pair.client.callTool({ name: 'search_notes', arguments: { query: 'agent' } })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toEqual({ query: 'agent', results: [{ relPath: 'ideas/agent.md' }] })
  })

  it('accepts the six-month shared-space duration cap and rejects longer leases', async () => {
    const pair = await connectTestPair(createNabuMcpServer(createFakeGateway()), AUTO_NEGOTIATION)
    connectedServer = pair.server

    const maximum = await pair.client.callTool({
      name: 'propose_shared_space',
      arguments: { path: 'ideas', durationDays: 183 },
    })
    expect(maximum.isError).not.toBe(true)

    const tooLong = await pair.client.callTool({
      name: 'propose_shared_space',
      arguments: { path: 'ideas', durationDays: 184 },
    })
    expect(tooLong.isError).toBe(true)
  })

  it('rejects compare-and-swap hashes on create_note', async () => {
    const pair = await connectTestPair(createNabuMcpServer(createFakeGateway()), AUTO_NEGOTIATION)
    connectedServer = pair.server

    const result = await pair.client.callTool({
      name: 'create_note',
      arguments: {
        path: 'ideas/new.md',
        rawMarkdown: '# New',
        expectedContentHash: 'a'.repeat(64),
      },
    })

    expect(result.isError).toBe(true)
  })

  it('supports an explicit modern protocol pin', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const handle = serveStdio(() => createNabuMcpServer(createFakeGateway()), { transport: serverTransport })
    const client = new Client(
      { name: 'nabu-mcp-test-client', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    )

    try {
      await client.connect(clientTransport)
      await expect(client.listTools()).resolves.toMatchObject({ tools: expect.any(Array) })
    } finally {
      await client.close()
      await handle.close()
    }
  })

  it('keeps the legacy-default client path interoperable', async () => {
    const pair = await connectTestPair(createNabuMcpServer(createFakeGateway()))
    connectedServer = pair.server

    await expect(pair.client.listResources()).resolves.toMatchObject({ resources: expect.any(Array) })
  })

  it('exposes the vault and note resources', async () => {
    const pair = await connectTestPair(createNabuMcpServer(createFakeGateway()), AUTO_NEGOTIATION)
    connectedServer = pair.server

    const resources = await pair.client.listResources()
    expect(resources.resources.map((resource) => resource.uri)).toContain('nabu://vault')

    const resource = await pair.client.readResource({ uri: 'nabu://note/ideas%2Fagent.md' })
    const content = resource.contents[0]
    expect(content && 'text' in content ? content.text : '').toContain('ideas/agent.md')
  })

  it('keeps bootstrap and shared surfaces explicitly isolated', async () => {
    const bootstrapPair = await connectTestPair(createNabuMcpServer(createFakeGateway(), 'bootstrap'), AUTO_NEGOTIATION)
    expect((await bootstrapPair.client.listTools()).tools.map((tool) => tool.name)).toEqual([
      'redeem_shared_space_invite',
    ])
    await expect(bootstrapPair.client.listResources()).resolves.toEqual({ resources: [] })
    await bootstrapPair.client.close()
    await bootstrapPair.server.close()

    const readPair = await connectTestPair(createNabuMcpServer(createFakeGateway(), 'shared-read'), AUTO_NEGOTIATION)
    expect((await readPair.client.listTools()).tools.map((tool) => tool.name)).toEqual([
      'get_vault_summary',
      'search_notes',
      'read_note',
      'list_folder',
      'get_neighborhood',
    ])
    await readPair.client.close()
    await readPair.server.close()

    const writePair = await connectTestPair(createNabuMcpServer(createFakeGateway(), 'shared-read-write'), AUTO_NEGOTIATION)
    expect((await writePair.client.listTools()).tools.map((tool) => tool.name)).toEqual([
      'get_vault_summary',
      'search_notes',
      'read_note',
      'list_folder',
      'get_neighborhood',
      'create_note',
      'update_note',
      'move_note',
      'delete_note',
    ])
    await writePair.client.close()
    await writePair.server.close()
  })

  it('returns bounded tool errors for oversized results', async () => {
    const gateway = createFakeGateway()
    gateway.getVaultSummary = async () => ({ value: 'x'.repeat(2_000_001) })
    const pair = await connectTestPair(createNabuMcpServer(gateway), AUTO_NEGOTIATION)
    connectedServer = pair.server

    const result = await pair.client.callTool({ name: 'get_vault_summary', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{ type: 'text', text: 'MCP result exceeds the 2000000-byte limit' }])
  })

  it('bounds structured note documents as well as raw markdown', async () => {
    const pair = await connectTestPair(createNabuMcpServer(createFakeGateway()), AUTO_NEGOTIATION)
    connectedServer = pair.server

    const result = await pair.client.callTool({
      name: 'create_note',
      arguments: { path: 'large.md', document: { body: 'x'.repeat(1_000_001) } },
    })

    expect(result.isError).toBe(true)
    expect(result.content[0]).toMatchObject({ type: 'text' })
  })
})
