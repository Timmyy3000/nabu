import { Client } from '@modelcontextprotocol/client'
import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server'
import { afterEach, describe, expect, it } from 'vitest'
import { createNabuMcpServer } from './server'
import type { KnowledgeGateway } from './gateway'

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
  }
}

async function connectTestPair(server: McpServer) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client(
    { name: 'nabu-mcp-test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  )

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
    const pair = await connectTestPair(createNabuMcpServer(createFakeGateway()))
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
    ])

    const result = await pair.client.callTool({ name: 'search_notes', arguments: { query: 'agent' } })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toEqual({ query: 'agent', results: [{ relPath: 'ideas/agent.md' }] })
  })

  it('exposes the vault and note resources', async () => {
    const pair = await connectTestPair(createNabuMcpServer(createFakeGateway()))
    connectedServer = pair.server

    const resources = await pair.client.listResources()
    expect(resources.resources.map((resource) => resource.uri)).toContain('nabu://vault')

    const resource = await pair.client.readResource({ uri: 'nabu://note/ideas%2Fagent.md' })
    const content = resource.contents[0]
    expect(content && 'text' in content ? content.text : '').toContain('ideas/agent.md')
  })

  it('returns bounded tool errors for oversized results', async () => {
    const gateway = createFakeGateway()
    gateway.getVaultSummary = async () => ({ value: 'x'.repeat(2_000_001) })
    const pair = await connectTestPair(createNabuMcpServer(gateway))
    connectedServer = pair.server

    const result = await pair.client.callTool({ name: 'get_vault_summary', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{ type: 'text', text: 'MCP result exceeds the 2000000-byte limit' }])
  })
})
