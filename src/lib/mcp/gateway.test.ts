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
import { deriveAgentCredential } from '../auth/agent-credential'

const PASSWORD = 'test-password'
const CREDENTIAL = deriveAgentCredential(PASSWORD)

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
    expect(() => validateMcpEnvironment({ NABU_URL: 'https://nabu.example' })).toThrow('NABU_PASSWORD is required')
    expect(() => validateMcpEnvironment({ NABU_URL: 'http://nabu.example', NABU_PASSWORD: PASSWORD })).toThrow('HTTPS')
  })

  it('does not echo the remote password in configuration errors', () => {
    const password = 'super-secret-password'
    let thrown: unknown

    try {
      validateMcpEnvironment({ NABU_URL: 'http://nabu.example', NABU_PASSWORD: password })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(McpConfigurationError)
    expect(String(thrown)).not.toContain(password)
  })

  it('allows loopback HTTP and prepares a newly requested direct vault', async () => {
    const root = path.join(os.tmpdir(), `nabu-mcp-${Date.now()}`)

    try {
      await prepareMcpEnvironment({ KNOWLEDGE_PATH: root, NABU_MCP_CREATE_VAULT: 'true' })

      const configuration = validateMcpEnvironment({ NABU_URL: 'http://localhost:3000', NABU_PASSWORD: PASSWORD })
      expect(configuration.mode).toBe('remote')
      if (configuration.mode !== 'remote') {
        throw new Error('expected remote MCP configuration')
      }
      expect(configuration.credential).toBe(CREDENTIAL)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('remote MCP gateway', () => {
  it('sends bearer credentials and maps search requests', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://nabu.example/api/vault/search?q=agent&limit=10')
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${CREDENTIAL}`)
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    })
    const gateway = createRemoteKnowledgeGateway({
      baseUrl: new URL('https://nabu.example'),
      credential: CREDENTIAL,
      fetchFn,
    })

    await expect(gateway.searchNotes({ query: 'agent', limit: 10 })).resolves.toEqual({ results: [] })
  })
})
