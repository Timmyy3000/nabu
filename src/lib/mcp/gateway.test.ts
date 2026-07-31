import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  McpConfigurationError,
  createRemoteKnowledgeGateway,
  getMcpModeFromEnvironment,
  prepareMcpEnvironment,
  validateMcpEnvironment,
} from './gateway'

const TOKEN = 'a'.repeat(40)

describe('MCP environment configuration', () => {
  it('requires exactly one local or remote mode', () => {
    expect(() => getMcpModeFromEnvironment({})).toThrow(McpConfigurationError)
    expect(getMcpModeFromEnvironment({ KNOWLEDGE_PATH: 'C:\\vault' })).toBe('direct')
    expect(getMcpModeFromEnvironment({ NABU_URL: 'https://nabu.example' })).toBe('remote')
    expect(() => getMcpModeFromEnvironment({ KNOWLEDGE_PATH: 'C:\\vault', NABU_URL: 'https://nabu.example' })).toThrow(
      McpConfigurationError,
    )
  })

  it('rejects relative, in-app, and insecure remote configuration', () => {
    expect(() => validateMcpEnvironment({ KNOWLEDGE_PATH: 'vault' })).toThrow('must be absolute')
    expect(() => validateMcpEnvironment({ KNOWLEDGE_PATH: process.cwd() })).toThrow('outside')
    expect(() => validateMcpEnvironment({ NABU_URL: 'https://nabu.example', NABU_AGENT_TOKEN: 'short' })).toThrow(
      'at least 32 characters',
    )
    expect(() => validateMcpEnvironment({ NABU_URL: 'http://nabu.example', NABU_AGENT_TOKEN: TOKEN })).toThrow(
      'HTTPS',
    )
  })

  it('allows loopback HTTP and prepares a newly requested direct vault', async () => {
    const root = path.join(os.tmpdir(), `nabu-mcp-${Date.now()}`)

    try {
      await prepareMcpEnvironment({ KNOWLEDGE_PATH: root, NABU_MCP_CREATE_VAULT: 'true' })

      const configuration = validateMcpEnvironment({ NABU_URL: 'http://localhost:3000', NABU_AGENT_TOKEN: TOKEN })
      expect(configuration.mode).toBe('remote')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('remote MCP gateway', () => {
  it('sends bearer credentials and maps search requests', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://nabu.example/api/vault/search?q=agent&limit=10')
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`)
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    })
    const gateway = createRemoteKnowledgeGateway({ baseUrl: new URL('https://nabu.example'), token: TOKEN, fetchFn })

    await expect(gateway.searchNotes({ query: 'agent', limit: 10 })).resolves.toEqual({ results: [] })
  })
})
