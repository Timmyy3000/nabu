import path from 'node:path'
import type { SharedSpacePermission } from '../shared-spaces/types'
import type { VaultStructuredNoteDocument } from '../vault/write-note'
import { hashVaultNote } from '../vault/content-hash'
import { deriveAgentCredential } from '../auth/agent-credential'

export type NoteWriteInput = {
  path: string
  rawMarkdown?: string
  document?: Record<string, unknown>
  expectedContentHash?: string
  expectedRevision?: string
}

export type NoteMoveInput = {
  path: string
  toPath: string
  expectedContentHash?: string
  expectedRevision?: string
}

export type SharedSpaceProposalInput = {
  path: string
  durationDays?: number
}

export type SharedSpaceConfirmationInput = {
  proposalId: string
  confirmed: boolean
  durationDays?: number
  permissions?: SharedSpacePermission[]
}

export type KnowledgeGateway = {
  getVaultSummary: () => Promise<unknown>
  searchNotes: (input: { query: string; path?: string; tag?: string; limit?: number; offset?: number }) => Promise<unknown>
  readNote: (path: string) => Promise<unknown>
  listFolder: (path?: string) => Promise<unknown>
  getNeighborhood: (path: string) => Promise<unknown>
  createNote: (input: NoteWriteInput) => Promise<unknown>
  updateNote: (input: NoteWriteInput) => Promise<unknown>
  moveNote: (input: NoteMoveInput) => Promise<unknown>
  deleteNote: (path: string) => Promise<unknown>
  proposeSharedSpace: (input: SharedSpaceProposalInput) => Promise<unknown>
  confirmSharedSpace: (input: SharedSpaceConfirmationInput) => Promise<unknown>
  listSharedSpaces: () => Promise<unknown>
  getSharedSpace: (sharedSpaceId: string) => Promise<unknown>
  revokeSharedSpace: (sharedSpaceId: string) => Promise<unknown>
  redeemSharedSpaceInvite: (inviteUrl: string) => Promise<unknown>
  createSharedSpaceInvite: (sharedSpaceId: string) => Promise<unknown>
  extendSharedSpace: (input: { sharedSpaceId: string; durationDays: number; confirmed: boolean }) => Promise<unknown>
}

export const MCP_MAX_NOTE_BYTES = 1_000_000
export const MCP_MAX_RESULT_BYTES = 2_000_000

export class McpConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpConfigurationError'
  }
}

function contentHash(value: unknown): string {
  return hashVaultNote(value)
}

function addContentHash(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value
  }

  return { ...value, contentHash: contentHash(value) }
}

async function assertExpectedContentHash(
  expectedContentHash: string | undefined,
  readCurrent: () => Promise<unknown>,
): Promise<void> {
  if (!expectedContentHash) {
    return
  }

  const current = await readCurrent()
  if (contentHash(current) !== expectedContentHash) {
    throw new Error('Note changed since it was read; retry with the latest contentHash')
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

function assertRemoteUrl(value: string): URL {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new McpConfigurationError('NABU_URL must be a valid URL')
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHostname(url.hostname))) {
    throw new McpConfigurationError('NABU_URL must use HTTPS unless it targets loopback')
  }

  return url
}

function assertDirectVaultPath(value: string): string {
  if (!path.isAbsolute(value)) {
    throw new McpConfigurationError('KNOWLEDGE_PATH must be absolute when used by nabu-mcp')
  }

  const resolved = path.resolve(value)
  const relativeToApp = path.relative(process.cwd(), resolved)
  const isInsideApp = relativeToApp === '' || (!relativeToApp.startsWith('..') && !path.isAbsolute(relativeToApp))

  if (isInsideApp) {
    throw new McpConfigurationError('KNOWLEDGE_PATH must point outside the Nabu application directory')
  }

  return resolved
}

export function getMcpModeFromEnvironment(env: NodeJS.ProcessEnv = process.env): 'direct' | 'remote' {
  const requestedMode = env.NABU_MCP_MODE?.trim()
  const hasDirectConfig = Boolean(env.KNOWLEDGE_PATH?.trim())
  const hasRemoteConfig = Boolean(env.NABU_URL?.trim())

  if (requestedMode === 'direct') {
    if (!hasDirectConfig || hasRemoteConfig) {
      throw new McpConfigurationError('Direct MCP mode requires KNOWLEDGE_PATH and no NABU_URL')
    }
    return 'direct'
  }

  if (requestedMode === 'remote') {
    if (!hasRemoteConfig || hasDirectConfig) {
      throw new McpConfigurationError('Remote MCP mode requires NABU_URL and no KNOWLEDGE_PATH')
    }
    return 'remote'
  }

  if (requestedMode) {
    throw new McpConfigurationError('NABU_MCP_MODE must be direct or remote')
  }

  if (hasDirectConfig === hasRemoteConfig) {
    throw new McpConfigurationError('Configure exactly one of KNOWLEDGE_PATH or NABU_URL for nabu-mcp')
  }

  return hasDirectConfig ? 'direct' : 'remote'
}

export function validateMcpEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): { mode: 'direct'; rootPath: string } | { mode: 'remote'; baseUrl: URL; credential: string } {
  const mode = getMcpModeFromEnvironment(env)

  if (mode === 'direct') {
    return {
      mode,
      rootPath: assertDirectVaultPath(env.KNOWLEDGE_PATH?.trim() ?? ''),
    }
  }

  const password = env.NABU_PASSWORD?.trim()
  if (!password) {
    throw new McpConfigurationError('NABU_PASSWORD is required in remote MCP mode')
  }

  return {
    mode,
    baseUrl: assertRemoteUrl(env.NABU_URL?.trim() ?? ''),
    credential: deriveAgentCredential(password),
  }
}

export async function prepareMcpEnvironment(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const configuration = validateMcpEnvironment(env)

  if (configuration.mode !== 'direct') {
    return
  }

  const { lstat, mkdir } = await import('node:fs/promises')

  let existingParent = configuration.rootPath
  while (true) {
    try {
      const parentStat = await lstat(existingParent)
      if (parentStat.isSymbolicLink()) {
        throw new McpConfigurationError('KNOWLEDGE_PATH cannot pass through a symbolic-link directory')
      }
      if (!parentStat.isDirectory()) {
        throw new McpConfigurationError('KNOWLEDGE_PATH parent must be a directory')
      }
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }

      const nextParent = path.dirname(existingParent)
      if (nextParent === existingParent) {
        throw new McpConfigurationError('Unable to resolve a real parent for KNOWLEDGE_PATH')
      }
      existingParent = nextParent
    }
  }

  try {
    const rootStat = await lstat(configuration.rootPath)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new McpConfigurationError('KNOWLEDGE_PATH must be a real directory, not a symlink')
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }

    if (env.NABU_MCP_CREATE_VAULT !== 'true') {
      throw new McpConfigurationError('KNOWLEDGE_PATH does not exist; create it or set NABU_MCP_CREATE_VAULT=true')
    }

    await mkdir(configuration.rootPath, { recursive: true })
  }
}

export function createDirectKnowledgeGateway(): KnowledgeGateway {
  function toVaultWriteInput(input: NoteWriteInput) {
    return {
      path: input.path,
      rawMarkdown: input.rawMarkdown ?? null,
      document: (input.document ?? null) as VaultStructuredNoteDocument | null,
    }
  }

  function toVaultUpdateInput(input: NoteWriteInput) {
    return {
      ...toVaultWriteInput(input),
      expectedContentHash: input.expectedContentHash ?? null,
      expectedRevision: input.expectedRevision ?? null,
    }
  }

  return {
    async getVaultSummary() {
      const { getVaultIndex } = await import('../vault/service')
      const index = await getVaultIndex()
      return {
        builtAt: index.builtAt,
        stats: index.stats,
        folders: index.folders,
      }
    },
    async searchNotes(input) {
      const { searchVaultNotes } = await import('../vault/service')
      return searchVaultNotes(input)
    },
    async readNote(notePath) {
      const { getNoteByPath } = await import('../vault/service')
      const result = await getNoteByPath(notePath)
      if (!result) {
        throw new Error(`Note not found: ${notePath}`)
      }
      return addContentHash(result)
    },
    async listFolder(folderPath = '') {
      const { getFolderListing } = await import('../vault/service')
      const result = await getFolderListing(folderPath)
      if (!result) {
        throw new Error(`Folder not found: ${folderPath}`)
      }
      return result
    },
    async getNeighborhood(notePath) {
      const { getNoteNeighborhoodByPath } = await import('../vault/service')
      const result = await getNoteNeighborhoodByPath(notePath)
      if (!result) {
        throw new Error(`Note not found: ${notePath}`)
      }
      return result
    },
    async createNote(input) {
      const { createVaultNote } = await import('../vault/service')
      return createVaultNote(toVaultWriteInput(input))
    },
    async updateNote(input) {
      const { updateVaultNote } = await import('../vault/service')
      await assertExpectedContentHash(input.expectedContentHash, async () => {
        const { getNoteByPath } = await import('../vault/service')
        const current = await getNoteByPath(input.path)
        if (!current) {
          throw new Error(`Note not found: ${input.path}`)
        }
        return current
      })
      return addContentHash(await updateVaultNote(toVaultUpdateInput(input)))
    },
    async moveNote(input) {
      const { moveVaultNote } = await import('../vault/service')
      await assertExpectedContentHash(input.expectedContentHash, async () => {
        const { getNoteByPath } = await import('../vault/service')
        const current = await getNoteByPath(input.path)
        if (!current) {
          throw new Error(`Note not found: ${input.path}`)
        }
        return current
      })
      return addContentHash(await moveVaultNote(input))
    },
    async deleteNote(notePath) {
      const { deleteVaultNote } = await import('../vault/service')
      return deleteVaultNote(notePath)
    },
    async proposeSharedSpace(input) {
      const { SharedSpaceService } = await import('../shared-spaces/service')
      return new SharedSpaceService().proposeSharedSpace({ ownerPrincipalId: 'owner', ...input })
    },
    async confirmSharedSpace(input) {
      const { SharedSpaceService } = await import('../shared-spaces/service')
      return new SharedSpaceService().confirmSharedSpace({ ownerPrincipalId: 'owner', ...input })
    },
    async listSharedSpaces() {
      const { SharedSpaceService } = await import('../shared-spaces/service')
      return new SharedSpaceService().listSharedSpaces({ ownerPrincipalId: 'owner' })
    },
    async getSharedSpace(sharedSpaceId) {
      const { SharedSpaceService } = await import('../shared-spaces/service')
      return new SharedSpaceService().getSharedSpace({ ownerPrincipalId: 'owner', sharedSpaceId })
    },
    async revokeSharedSpace(sharedSpaceId) {
      const { SharedSpaceService } = await import('../shared-spaces/service')
      return new SharedSpaceService().revokeSharedSpace({ ownerPrincipalId: 'owner', sharedSpaceId })
    },
    async redeemSharedSpaceInvite(inviteUrl) {
      const { SharedSpaceService } = await import('../shared-spaces/service')
      return new SharedSpaceService().redeemSharedSpaceInvite({ inviteUrl })
    },
    async createSharedSpaceInvite(sharedSpaceId) {
      const { SharedSpaceService } = await import('../shared-spaces/service')
      return new SharedSpaceService().createSharedSpaceInvite({ ownerPrincipalId: 'owner', sharedSpaceId })
    },
    async extendSharedSpace(input) {
      const { SharedSpaceService } = await import('../shared-spaces/service')
      return new SharedSpaceService().extendSharedSpace({ ownerPrincipalId: 'owner', ...input })
    },
  }
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return { error: text }
  }
}

function errorMessage(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') {
    return payload.error
  }

  return `Nabu API request failed with status ${status}`
}

class NabuApiError extends Error {
  constructor(public readonly payload: unknown, public readonly status: number) {
    super(errorMessage(payload, status))
    this.name = 'NabuApiError'
  }
}

export function createRemoteKnowledgeGateway(config: {
  baseUrl: URL
  credential: string
  fetchFn?: typeof fetch
}): KnowledgeGateway {
  const fetchFn = config.fetchFn ?? fetch

  async function request(route: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${config.credential}`)
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetchFn(new URL(route, config.baseUrl), {
      ...init,
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    const payload = await readJsonResponse(response)

    if (!response.ok) {
      throw new NabuApiError(payload, response.status)
    }

    return payload
  }

  return {
    getVaultSummary: () => request('/api/vault/'),
    searchNotes: (input) => {
      const params = new URLSearchParams({ q: input.query })
      if (input.path) params.set('path', input.path)
      if (input.tag) params.set('tag', input.tag)
      if (input.limit !== undefined) params.set('limit', String(input.limit))
      if (input.offset !== undefined) params.set('offset', String(input.offset))
      return request(`/api/vault/search?${params.toString()}`)
    },
    readNote: async (notePath) => addContentHash(await request(`/api/vault/notes/by-path?path=${encodeURIComponent(notePath)}`)),
    listFolder: (folderPath = '') => request(`/api/vault/folders?path=${encodeURIComponent(folderPath)}`),
    getNeighborhood: (notePath) => request(`/api/vault/notes/neighborhood?path=${encodeURIComponent(notePath)}`),
    createNote: (input) => request('/api/vault/notes', { method: 'POST', body: JSON.stringify(input) }),
    updateNote: async (input) => {
      await assertExpectedContentHash(input.expectedContentHash, () => request(`/api/vault/notes/by-path?path=${encodeURIComponent(input.path)}`))
      return addContentHash(await request('/api/vault/notes/by-path', { method: 'PUT', body: JSON.stringify(input) }))
    },
    moveNote: async (input) => {
      await assertExpectedContentHash(input.expectedContentHash, () => request(`/api/vault/notes/by-path?path=${encodeURIComponent(input.path)}`))
      return addContentHash(await request('/api/vault/notes/by-path', { method: 'PATCH', body: JSON.stringify(input) }))
    },
    deleteNote: (notePath) => request(`/api/vault/notes/by-path?path=${encodeURIComponent(notePath)}`, { method: 'DELETE' }),
    proposeSharedSpace: (input) => request('/api/shared-spaces/proposals', { method: 'POST', body: JSON.stringify(input) }),
    confirmSharedSpace: (input) => request('/api/shared-spaces/', { method: 'POST', body: JSON.stringify(input) }),
    listSharedSpaces: () => request('/api/shared-spaces/'),
    getSharedSpace: (sharedSpaceId) => request(`/api/shared-spaces/${encodeURIComponent(sharedSpaceId)}`),
    revokeSharedSpace: (sharedSpaceId) => request(`/api/shared-spaces/${encodeURIComponent(sharedSpaceId)}/revoke`, { method: 'POST' }),
    redeemSharedSpaceInvite: (inviteUrl) => request('/api/shared-spaces/invites/redeem', { method: 'POST', body: JSON.stringify({ inviteUrl }) }),
    createSharedSpaceInvite: (sharedSpaceId) => request(`/api/shared-spaces/${encodeURIComponent(sharedSpaceId)}/invites`, { method: 'POST' }),
    extendSharedSpace: (input) => request(`/api/shared-spaces/${encodeURIComponent(input.sharedSpaceId)}/extend`, { method: 'POST', body: JSON.stringify(input) }),
  }
}

export function createKnowledgeGatewayFromEnvironment(env: NodeJS.ProcessEnv = process.env): KnowledgeGateway {
  const configuration = validateMcpEnvironment(env)

  if (configuration.mode === 'direct') {
    return createDirectKnowledgeGateway()
  }

  return createRemoteKnowledgeGateway(configuration)
}
