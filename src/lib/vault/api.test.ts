import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  __resetVaultServiceForTests,
  createVaultFolderResponse,
  createVaultNoteResponse,
  getVaultFolderListingResponse,
  getVaultIndexResponse,
  getVaultIndexStatsResponse,
  getVaultNoteNeighborhoodResponse,
  getVaultNoteByPathResponse,
  getVaultNoteBySlugResponse,
  getVaultSearchResponse,
  getVaultTreeResponse,
  updateVaultNoteByPathResponse,
} from './service'

const ORIGINAL_KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH
const tempRoots: string[] = []

async function createVaultFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-api-'))
  tempRoots.push(root)

  await Promise.all(
    Object.entries(files).map(async ([relPath, content]) => {
      const absPath = path.join(root, relPath)
      await mkdir(path.dirname(absPath), { recursive: true })
      await writeFile(absPath, content)
    }),
  )

  process.env.KNOWLEDGE_PATH = root
  __resetVaultServiceForTests()

  return root
}

afterEach(async () => {
  process.env.KNOWLEDGE_PATH = ORIGINAL_KNOWLEDGE_PATH
  __resetVaultServiceForTests()

  await Promise.allSettled(tempRoots.map(async (root) => rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('vault retrieval contracts', () => {
  it('returns index summary payload without absolute paths', async () => {
    const root = await createVaultFixture({
      'ideas/agent-memory.md': '---\ntags: [AI]\n---\n# Agent Memory',
      'projects/nabu/roadmap.md': '# Roadmap',
    })

    const response = await getVaultIndexResponse()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      builtAt: expect.any(String),
      stats: {
        noteCount: 2,
        folderCount: 3,
        tagCount: 1,
        collisionCount: 0,
        warningCount: 0,
      },
      notes: [
        {
          relPath: 'ideas/agent-memory.md',
          slug: 'agent-memory',
          tags: ['ai'],
        },
        {
          relPath: 'projects/nabu/roadmap.md',
          slug: 'roadmap',
        },
      ],
    })

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('absPath')
    expect(serialized).not.toContain(root)
  })

  it('returns index stats payload', async () => {
    await createVaultFixture({
      'ideas/agent-memory.md': '# Agent Memory',
    })

    const response = await getVaultIndexStatsResponse()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      builtAt: expect.any(String),
      stats: {
        noteCount: 1,
        folderCount: 1,
        tagCount: 0,
        collisionCount: 0,
        warningCount: 0,
      },
      warnings: [],
    })
  })

  it('returns note payload by slug and 404 for missing note', async () => {
    await createVaultFixture({
      'ideas/a.md': '---\nslug: shared\n---\n# A',
      'ideas/z.md': '---\nslug: shared\n---\n# Z',
    })

    const found = await getVaultNoteBySlugResponse('shared')
    const foundPayload = await found.json()
    const missing = await getVaultNoteBySlugResponse('missing')
    const missingPayload = await missing.json()

    expect(found.status).toBe(200)
    expect(foundPayload).toMatchObject({
      builtAt: expect.any(String),
      collisions: ['ideas/a.md', 'ideas/z.md'],
      note: {
        relPath: 'ideas/a.md',
        slug: 'shared',
        body: '# A',
      },
    })

    const foundSerialized = JSON.stringify(foundPayload)
    expect(foundSerialized).not.toContain('absPath')

    expect(missing.status).toBe(404)
    expect(missingPayload).toEqual({
      error: 'Note not found',
      slug: 'missing',
    })
  })

  it('returns note payload by path, 400 for invalid path, and 404 for unknown note', async () => {
    await createVaultFixture({
      'projects/nabu/roadmap.md': '# Roadmap',
    })

    const found = await getVaultNoteByPathResponse(' projects\\nabu\\roadmap.md ')
    const foundPayload = await found.json()
    const invalid = await getVaultNoteByPathResponse('../secrets.md')
    const invalidPayload = await invalid.json()
    const missing = await getVaultNoteByPathResponse('projects/nabu/missing.md')
    const missingPayload = await missing.json()

    expect(found.status).toBe(200)
    expect(foundPayload).toMatchObject({
      builtAt: expect.any(String),
      note: {
        relPath: 'projects/nabu/roadmap.md',
        slug: 'roadmap',
        body: '# Roadmap',
      },
    })

    expect(invalid.status).toBe(400)
    expect(invalidPayload).toEqual({
      error: 'Invalid note path',
      path: '../secrets.md',
    })

    expect(missing.status).toBe(404)
    expect(missingPayload).toEqual({
      error: 'Note not found',
      path: 'projects/nabu/missing.md',
    })
  })

  it('returns neighborhood payload by path, 400 for invalid path, and 404 for unknown note', async () => {
    await createVaultFixture({
      'projects/roadmap.md': '[[projects/vision.md]]',
      'projects/vision.md': '# Vision',
      'projects/plan.md': '[[projects/roadmap.md]]',
    })

    const found = await getVaultNoteNeighborhoodResponse('projects/roadmap.md')
    const foundPayload = await found.json()
    const invalid = await getVaultNoteNeighborhoodResponse('../secrets.md')
    const invalidPayload = await invalid.json()
    const missing = await getVaultNoteNeighborhoodResponse('projects/missing.md')
    const missingPayload = await missing.json()

    expect(found.status).toBe(200)
    expect(foundPayload).toMatchObject({
      builtAt: expect.any(String),
      note: {
        relPath: 'projects/roadmap.md',
        slug: 'roadmap',
      },
      outgoing: [{ targetRelPath: 'projects/vision.md', targetSlug: 'vision', targetTitle: 'Vision' }],
      backlinks: [
        {
          sourceRelPath: 'projects/plan.md',
          sourceSlug: 'plan',
          raw: '[[projects/roadmap.md]]',
        },
      ],
      unresolvedOutgoing: [],
      stats: {
        outgoingResolvedCount: 1,
        backlinkCount: 1,
        unresolvedOutgoingCount: 0,
      },
    })

    expect(invalid.status).toBe(400)
    expect(invalidPayload).toEqual({
      error: 'Invalid note path',
      path: '../secrets.md',
    })

    expect(missing.status).toBe(404)
    expect(missingPayload).toEqual({
      error: 'Note not found',
      path: 'projects/missing.md',
    })
  })

  it('returns folder tree payload with deterministic ordering and no absolute paths', async () => {
    const root = await createVaultFixture({
      'inbox.md': '# Inbox',
      'ideas/notes.md': '# Notes',
      'ideas/ai/agent-memory.md': '# Agent Memory',
      'projects/nabu/roadmap.md': '# Roadmap',
      'projects/zeta.md': '# Zeta',
    })

    const response = await getVaultTreeResponse()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      builtAt: expect.any(String),
      tree: {
        path: '',
        name: '',
        directNoteCount: 1,
        noteCount: 5,
        children: [
          {
            path: 'ideas',
            name: 'ideas',
            directNoteCount: 1,
            noteCount: 2,
            children: [
              {
                path: 'ideas/ai',
                name: 'ai',
                directNoteCount: 1,
                noteCount: 1,
                children: [],
              },
            ],
          },
          {
            path: 'projects',
            name: 'projects',
            directNoteCount: 1,
            noteCount: 2,
            children: [
              {
                path: 'projects/nabu',
                name: 'nabu',
                directNoteCount: 1,
                noteCount: 1,
                children: [],
              },
            ],
          },
        ],
      },
    })

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('absPath')
    expect(serialized).not.toContain(root)
  })

  it('returns folder listing payload for root and nested folders', async () => {
    await createVaultFixture({
      'inbox.md': '# Inbox',
      'ideas/alpha.md': '# Alpha',
      'ideas/zeta.md': '# Zeta',
      'ideas/ai/agent-memory.md': '# Agent Memory',
      'projects/nabu/roadmap.md': '# Roadmap',
    })

    const rootResponse = await getVaultFolderListingResponse(null)
    const rootPayload = await rootResponse.json()

    expect(rootResponse.status).toBe(200)
    expect(rootPayload).toMatchObject({
      builtAt: expect.any(String),
      folder: {
        path: '',
        folders: [
          {
            path: 'ideas',
            name: 'ideas',
            directNoteCount: 2,
            noteCount: 3,
          },
          {
            path: 'projects',
            name: 'projects',
            directNoteCount: 0,
            noteCount: 1,
          },
        ],
        notes: [{ relPath: 'inbox.md', slug: 'inbox' }],
      },
    })

    const ideasResponse = await getVaultFolderListingResponse('ideas')
    const ideasPayload = await ideasResponse.json()

    expect(ideasResponse.status).toBe(200)
    expect(ideasPayload).toMatchObject({
      builtAt: expect.any(String),
      folder: {
        path: 'ideas',
        name: 'ideas',
        folders: [{ path: 'ideas/ai', name: 'ai' }],
        notes: [{ relPath: 'ideas/alpha.md' }, { relPath: 'ideas/zeta.md' }],
      },
    })
  })

  it('returns 400 for invalid folder path and 404 for unknown folder path', async () => {
    await createVaultFixture({
      'ideas/note.md': '# Note',
    })

    const invalid = await getVaultFolderListingResponse('../secrets')
    const invalidPayload = await invalid.json()
    const missing = await getVaultFolderListingResponse('ideas/unknown')
    const missingPayload = await missing.json()

    expect(invalid.status).toBe(400)
    expect(invalidPayload).toEqual({
      error: 'Invalid folder path',
      folder: '../secrets',
    })

    expect(missing.status).toBe(404)
    expect(missingPayload).toEqual({
      error: 'Folder not found',
      folder: 'ideas/unknown',
    })
  })

  it('returns folder listing for persisted empty folders', async () => {
    const root = await createVaultFixture({
      'ideas/note.md': '# Note',
    })
    await mkdir(path.join(root, 'ideas', 'empty'), { recursive: true })

    const response = await getVaultFolderListingResponse('ideas/empty')
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      builtAt: expect.any(String),
      folder: {
        path: 'ideas/empty',
        name: 'empty',
        folders: [],
        notes: [],
      },
    })
  })

  it('returns lexical search payload with normalized query and pagination metadata', async () => {
    await createVaultFixture({
      'ideas/agent-memory.md': '---\ntitle: Agent Memory\nsummary: Shared context for agents\n---\nBody',
      'ideas/agent-runtime.md': '---\ntitle: Agent Runtime\nsummary: Runtime details\n---\nBody',
    })

    const response = await getVaultSearchResponse({
      query: 'agent',
      path: '',
      tag: null,
      limit: '1',
      offset: '0',
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      builtAt: expect.any(String),
      query: 'agent',
      normalizedQuery: 'agent',
      exactPhrases: [],
      tokens: ['agent'],
      path: '',
      tag: null,
      limit: 1,
      offset: 0,
      total: 2,
      hasMore: true,
      results: [
        {
          id: expect.any(String),
          relPath: expect.any(String),
          slug: expect.any(String),
          title: expect.any(String),
          summary: expect.anything(),
          tags: expect.any(Array),
          score: expect.any(Number),
          reasons: expect.any(Array),
          snippet: expect.any(String),
        },
      ],
    })
  })

  it('applies tag filter from search API input', async () => {
    await createVaultFixture({
      'ideas/agent-memory.md': '---\ntitle: Agent Memory\ntags: [ai]\n---\nBody',
      'ideas/agent-runtime.md': '---\ntitle: Agent Runtime\ntags: [systems]\n---\nBody',
    })

    const response = await getVaultSearchResponse({
      query: 'agent',
      path: '',
      tag: 'AI',
      limit: null,
      offset: null,
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      query: 'agent',
      normalizedQuery: 'agent',
      tag: 'ai',
      total: 1,
      results: [{ relPath: 'ideas/agent-memory.md' }],
    })
  })

  it('returns 400 for empty search query', async () => {
    await createVaultFixture({
      'ideas/agent-memory.md': '# Agent Memory',
    })

    const response = await getVaultSearchResponse({
      query: '   ',
      path: '',
      tag: null,
      limit: null,
      offset: null,
    })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({
      error: 'Search query is required',
    })
  })

  it('returns 200 with empty results for unknown search path scope', async () => {
    await createVaultFixture({
      'ideas/agent-memory.md': '# Agent Memory',
    })

    const response = await getVaultSearchResponse({
      query: 'agent',
      path: 'projects',
      tag: null,
      limit: null,
      offset: null,
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      query: 'agent',
      normalizedQuery: 'agent',
      path: 'projects',
      total: 0,
      hasMore: false,
      results: [],
    })
  })

  it('creates folders with deterministic 201/200 semantics', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const created = await createVaultFolderResponse({ path: 'projects/nabu/specs' })
    const createdPayload = await created.json()
    const existing = await createVaultFolderResponse({ path: 'projects/nabu/specs' })
    const existingPayload = await existing.json()
    const invalid = await createVaultFolderResponse({ path: '../secrets' })
    const invalidPayload = await invalid.json()

    expect(created.status).toBe(201)
    expect(createdPayload).toEqual({
      builtAt: expect.any(String),
      folder: {
        path: 'projects/nabu/specs',
        created: true,
      },
    })

    expect(existing.status).toBe(200)
    expect(existingPayload).toEqual({
      builtAt: expect.any(String),
      folder: {
        path: 'projects/nabu/specs',
        created: false,
      },
    })

    expect(invalid.status).toBe(400)
    expect(invalidPayload).toEqual({
      error: 'Invalid folder path',
      path: '../secrets',
    })
  })

  it('creates notes with 201, 409, and 400 semantics', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const created = await createVaultNoteResponse({
      path: 'projects/nabu/specs/agent-operability',
      rawMarkdown: '# Agent Operability\n\nWrite surfaces for agents.',
    })
    const createdPayload = await created.json()
    const conflict = await createVaultNoteResponse({
      path: 'projects/nabu/specs/agent-operability.md',
      rawMarkdown: '# Duplicate',
    })
    const conflictPayload = await conflict.json()
    const invalid = await createVaultNoteResponse({
      path: '../secrets',
      rawMarkdown: '# Bad',
    })
    const invalidPayload = await invalid.json()

    expect(created.status).toBe(201)
    expect(createdPayload).toMatchObject({
      builtAt: expect.any(String),
      created: true,
      note: {
        relPath: 'projects/nabu/specs/agent-operability.md',
      },
    })

    expect(conflict.status).toBe(409)
    expect(conflictPayload).toEqual({
      error: 'Note already exists',
      path: 'projects/nabu/specs/agent-operability.md',
    })

    expect(invalid.status).toBe(400)
    expect(invalidPayload).toEqual({
      error: 'Invalid note path',
      path: '../secrets',
    })
  })

  it('updates notes with 200, 404, and 400 semantics', async () => {
    await createVaultFixture({
      'projects/nabu/specs/agent-operability.md': '# Agent Operability\n\nInitial.',
    })

    const updated = await updateVaultNoteByPathResponse({
      path: 'projects/nabu/specs/agent-operability.md',
      rawMarkdown: '# Agent Operability\n\nUpdated.',
    })
    const updatedPayload = await updated.json()
    const missing = await updateVaultNoteByPathResponse({
      path: 'projects/nabu/specs/missing.md',
      rawMarkdown: '# Missing',
    })
    const missingPayload = await missing.json()
    const invalid = await updateVaultNoteByPathResponse({
      path: '../secrets.md',
      rawMarkdown: '# Bad',
    })
    const invalidPayload = await invalid.json()

    expect(updated.status).toBe(200)
    expect(updatedPayload).toMatchObject({
      builtAt: expect.any(String),
      updated: true,
      note: {
        relPath: 'projects/nabu/specs/agent-operability.md',
        body: '# Agent Operability\n\nUpdated.',
      },
    })

    expect(missing.status).toBe(404)
    expect(missingPayload).toEqual({
      error: 'Note not found',
      path: 'projects/nabu/specs/missing.md',
    })

    expect(invalid.status).toBe(400)
    expect(invalidPayload).toEqual({
      error: 'Invalid note path',
      path: '../secrets.md',
    })
  })
})
