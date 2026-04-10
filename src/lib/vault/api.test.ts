import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  __resetVaultServiceForTests,
  getVaultFolderListingResponse,
  getVaultIndexResponse,
  getVaultIndexStatsResponse,
  getVaultNoteBySlugResponse,
  getVaultTreeResponse,
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
})
