import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { MCP_MAX_NOTE_BYTES, MCP_MAX_RESULT_BYTES, type KnowledgeGateway } from './gateway'

const pathSchema = z.string().trim().min(1).max(4_096)
const optionalPathSchema = z.string().trim().max(4_096).optional()
const documentSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= MCP_MAX_NOTE_BYTES,
    'document exceeds the byte limit',
  )
  .optional()

const noteWriteShape = {
  path: pathSchema,
  rawMarkdown: z
    .string()
    .max(MCP_MAX_NOTE_BYTES)
    .refine((value) => new TextEncoder().encode(value).byteLength <= MCP_MAX_NOTE_BYTES, 'rawMarkdown exceeds the byte limit')
    .optional(),
  document: documentSchema,
}

const noteCreateSchema = z
  .object(noteWriteShape)
  .strict()
  .refine((input) => Boolean(input.rawMarkdown?.trim()) !== Boolean(input.document), {
    message: 'Provide exactly one of rawMarkdown or document',
  })

const noteUpdateSchema = z
  .object({
    ...noteWriteShape,
    expectedContentHash: z.string().length(64).optional(),
  })
  .strict()
  .refine((input) => Boolean(input.rawMarkdown?.trim()) !== Boolean(input.document), {
    message: 'Provide exactly one of rawMarkdown or document',
  })

const moveSchema = z.object({
  path: pathSchema,
  toPath: pathSchema,
  expectedContentHash: z.string().length(64).optional(),
})

function asResourcePath(value: string | string[] | undefined): string {
  const encodedPath = Array.isArray(value) ? value.join('/') : value ?? ''

  try {
    return decodeURIComponent(encodedPath)
  } catch {
    return encodedPath
  }
}

function resultObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return { value }
}

function boundedJson(value: unknown): string {
  const text = JSON.stringify(value) ?? 'null'
  if (new TextEncoder().encode(text).byteLength > MCP_MAX_RESULT_BYTES) {
    throw new Error(`MCP result exceeds the ${MCP_MAX_RESULT_BYTES}-byte limit`)
  }
  return text
}

function formatResult(value: unknown): {
  content: [{ type: 'text'; text: string }]
  structuredContent?: Record<string, unknown>
  isError?: boolean
} {
  const text = boundedJson(value)

  return {
    content: [{ type: 'text', text }],
    structuredContent: resultObject(value),
  }
}

async function callGateway(operation: () => Promise<unknown>) {
  try {
    return formatResult(await operation())
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Nabu MCP request failed' }],
      isError: true,
    }
  }
}

function registerTools(server: McpServer, gateway: KnowledgeGateway): void {
  server.registerTool(
    'get_vault_summary',
    {
      title: 'Get vault summary',
      description: 'Return high-level statistics and folders for the shared Nabu knowledge space.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    () => callGateway(() => gateway.getVaultSummary()),
  )

  server.registerTool(
    'search_notes',
    {
      title: 'Search notes',
      description: 'Search indexed markdown notes by text, folder, and tag.',
      inputSchema: z.object({
        query: z.string().trim().min(1).max(512),
        path: optionalPathSchema,
        tag: z.string().trim().max(256).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).max(100_000).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) => callGateway(() => gateway.searchNotes(input)),
  )

  server.registerTool(
    'read_note',
    {
      title: 'Read note',
      description: 'Read one markdown note, including frontmatter, body, links, and backlinks.',
      inputSchema: z.object({ path: pathSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) => callGateway(() => gateway.readNote(input.path)),
  )

  server.registerTool(
    'list_folder',
    {
      title: 'List folder',
      description: 'List direct child folders and notes in the shared knowledge space.',
      inputSchema: z.object({ path: optionalPathSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) => callGateway(() => gateway.listFolder(input.path)),
  )

  server.registerTool(
    'get_neighborhood',
    {
      title: 'Get note neighborhood',
      description: 'Return outgoing links, backlinks, unresolved links, and related notes.',
      inputSchema: z.object({ path: pathSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    (input) => callGateway(() => gateway.getNeighborhood(input.path)),
  )

  server.registerTool(
    'create_note',
    {
      title: 'Create note',
      description: 'Create a markdown note in the shared knowledge space.',
      inputSchema: noteCreateSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (input) => callGateway(() => gateway.createNote(input)),
  )

  server.registerTool(
    'update_note',
    {
      title: 'Update note',
      description: 'Replace one existing markdown note in the shared knowledge space.',
      inputSchema: noteUpdateSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    (input) => callGateway(() => gateway.updateNote(input)),
  )

  server.registerTool(
    'move_note',
    {
      title: 'Move note',
      description: 'Move a note to another path without overwriting an existing destination.',
      inputSchema: moveSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    (input) => callGateway(() => gateway.moveNote(input)),
  )

  server.registerTool(
    'delete_note',
    {
      title: 'Delete note',
      description: 'Delete one markdown note from the shared knowledge space.',
      inputSchema: z.object({ path: pathSchema }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    (input) => callGateway(() => gateway.deleteNote(input.path)),
  )
}

function registerResources(server: McpServer, gateway: KnowledgeGateway): void {
  server.registerResource(
    'vault',
    'nabu://vault',
    { title: 'Nabu vault summary', description: 'Summary of the shared knowledge space.', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, text: boundedJson(await gateway.getVaultSummary()), mimeType: 'application/json' }] }),
  )

  server.registerResource(
    'note',
    new ResourceTemplate('nabu://note/{path}', { list: undefined }),
    { title: 'Nabu note', description: 'A markdown note from the shared knowledge space.', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [{
        uri: uri.href,
        text: boundedJson(await gateway.readNote(asResourcePath(variables.path))),
        mimeType: 'application/json',
      }],
    }),
  )

  server.registerResource(
    'folder',
    new ResourceTemplate('nabu://folder/{path}', { list: undefined }),
    { title: 'Nabu folder', description: 'A folder listing from the shared knowledge space.', mimeType: 'application/json' },
    async (uri, variables) => ({
      contents: [{
        uri: uri.href,
        text: boundedJson(await gateway.listFolder(asResourcePath(variables.path))),
        mimeType: 'application/json',
      }],
    }),
  )
}

export function createNabuMcpServer(gateway: KnowledgeGateway): McpServer {
  const server = new McpServer({ name: 'nabu', version: '0.5.1' })
  registerTools(server, gateway)
  registerResources(server, gateway)
  return server
}
