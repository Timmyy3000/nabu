import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  __resetVaultServiceForTests,
  createVaultFolder,
  createVaultNote,
  getVaultBrowseData,
  getFolderListing,
  getNoteByPath,
  getNoteNeighborhoodByPath,
  getNoteBySlug,
  getVaultIndex,
  searchVaultNotes,
  getVaultTree,
  rebuildVaultIndex,
  updateVaultNote,
} from './service'

const ORIGINAL_KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH
const tempRoots: string[] = []

async function createVaultFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-service-'))
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

describe('vault service', () => {
  it('loads the index lazily and returns the same cached object until rebuilt', async () => {
    await createVaultFixture({
      'ideas/first.md': '# First',
      'ideas/second.md': '# Second',
    })

    const first = await getVaultIndex()
    const second = await getVaultIndex()

    expect(first).toBe(second)
    expect(first.stats.noteCount).toBe(2)
  })

  it('rebuilds the index and refreshes cache contents', async () => {
    const root = await createVaultFixture({
      'ideas/first.md': '# First',
    })

    const first = await getVaultIndex()
    await writeFile(path.join(root, 'ideas', 'second.md'), '# Second')

    const rebuilt = await rebuildVaultIndex()
    const cached = await getVaultIndex()

    expect(rebuilt).toBe(cached)
    expect(rebuilt).not.toBe(first)
    expect(rebuilt.stats.noteCount).toBe(2)
  })

  it('returns deterministic note-by-slug winner and collision relPaths', async () => {
    await createVaultFixture({
      'ideas/a.md': '---\nslug: shared\n---\n# A',
      'ideas/z.md': '---\nslug: shared\n---\n# Z',
      'ideas/unique.md': '# Unique',
    })

    const shared = await getNoteBySlug('shared')
    const unique = await getNoteBySlug('unique')

    expect(shared).toMatchObject({
      note: {
        relPath: 'ideas/a.md',
        slug: 'shared',
      },
      collisions: ['ideas/a.md', 'ideas/z.md'],
    })

    expect(unique).toMatchObject({
      note: {
        relPath: 'ideas/unique.md',
        slug: 'unique',
      },
      collisions: [],
    })
  })

  it('returns note by canonical vault-relative path', async () => {
    await createVaultFixture({
      'ideas/agent-memory.md': '# Agent Memory',
    })

    const found = await getNoteByPath('ideas/agent-memory.md')
    const missing = await getNoteByPath('ideas/missing.md')

    expect(found).toMatchObject({
      note: {
        relPath: 'ideas/agent-memory.md',
        slug: 'agent-memory',
      },
    })

    expect(missing).toBeNull()
  })

  it('includes outgoing links in note retrieval payloads', async () => {
    await createVaultFixture({
      'ideas/source.md': `[[Roadmap]]\n[Roadmap Doc](../projects/roadmap.md)\n[[Missing]]`,
      'projects/roadmap.md': '---\nslug: roadmap\n---\n# Roadmap',
    })

    const source = await getNoteByPath('ideas/source.md')
    const roadmap = await getNoteByPath('projects/roadmap.md')

    expect(source?.note.outgoingLinks).toEqual([
      {
        raw: '[[Roadmap]]',
        kind: 'wiki',
        text: null,
        target: 'Roadmap',
        resolved: true,
        targetRelPath: 'projects/roadmap.md',
        targetSlug: 'roadmap',
      },
      {
        raw: '[Roadmap Doc](../projects/roadmap.md)',
        kind: 'markdown',
        text: 'Roadmap Doc',
        target: '../projects/roadmap.md',
        resolved: true,
        targetRelPath: 'projects/roadmap.md',
        targetSlug: 'roadmap',
      },
      {
        raw: '[[Missing]]',
        kind: 'wiki',
        text: null,
        target: 'Missing',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
    ])

    expect(roadmap?.note.backlinks).toEqual([
      {
        sourceRelPath: 'ideas/source.md',
        sourceSlug: 'source',
        sourceTitle: 'source',
        kind: 'markdown',
        text: 'Roadmap Doc',
        raw: '[Roadmap Doc](../projects/roadmap.md)',
      },
      {
        sourceRelPath: 'ideas/source.md',
        sourceSlug: 'source',
        sourceTitle: 'source',
        kind: 'wiki',
        text: null,
        raw: '[[Roadmap]]',
      },
    ])
  })

  it('builds deterministic neighborhood traversal data by canonical note path', async () => {
    await createVaultFixture({
      'projects/roadmap.md': [
        '---',
        'title: Product Roadmap',
        'slug: roadmap',
        '---',
        '[[projects/vision.md]]',
        '[[projects/tasks.md]]',
        '[[projects/roadmap.md]]',
        '[[missing]]',
      ].join('\n'),
      'projects/vision.md': '# Vision',
      'projects/tasks.md': '# Tasks',
      'projects/notes.md': '# Notes',
      'projects/plan.md': '[[projects/roadmap.md]]',
      'ideas/retrospective.md': '[[projects/roadmap.md]]',
    })

    const neighborhood = await getNoteNeighborhoodByPath('projects/roadmap.md')
    expect(neighborhood).not.toBeNull()
    expect(neighborhood).toMatchObject({
      note: {
        relPath: 'projects/roadmap.md',
        slug: 'roadmap',
        title: 'Product Roadmap',
      },
      outgoing: [
        {
          targetRelPath: 'projects/roadmap.md',
          targetSlug: 'roadmap',
        },
        {
          targetRelPath: 'projects/tasks.md',
          targetSlug: 'tasks',
        },
        {
          targetRelPath: 'projects/vision.md',
          targetSlug: 'vision',
        },
      ],
      stats: {
        outgoingResolvedCount: 3,
        backlinkCount: 3,
        unresolvedOutgoingCount: 1,
      },
      relatedNotes: [
        {
          relPath: 'projects/plan.md',
          slug: 'plan',
          title: 'plan',
          connectionCount: 3,
          reasons: ['backlink', 'shared-folder'],
        },
        {
          relPath: 'projects/tasks.md',
          slug: 'tasks',
          title: 'tasks',
          connectionCount: 3,
          reasons: ['outgoing', 'shared-folder'],
        },
        {
          relPath: 'projects/vision.md',
          slug: 'vision',
          title: 'vision',
          connectionCount: 3,
          reasons: ['outgoing', 'shared-folder'],
        },
        {
          relPath: 'ideas/retrospective.md',
          slug: 'retrospective',
          title: 'retrospective',
          connectionCount: 2,
          reasons: ['backlink'],
        },
        {
          relPath: 'projects/notes.md',
          slug: 'notes',
          title: 'notes',
          connectionCount: 1,
          reasons: ['shared-folder'],
        },
      ],
    })

    expect(await getNoteNeighborhoodByPath('projects/missing.md')).toBeNull()
  })

  it('builds a deterministic nested folder tree for navigation', async () => {
    await createVaultFixture({
      'inbox.md': '# Inbox',
      'projects/zeta.md': '# Zeta',
      'ideas/notes.md': '# Notes',
      'ideas/ai/agent-memory.md': '# Agent Memory',
      'projects/nabu/roadmap.md': '# Roadmap',
    })

    const tree = await getVaultTree()

    expect(tree).toEqual({
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
    })
  })

  it('returns deterministic folder listings for root and nested folders', async () => {
    await createVaultFixture({
      'inbox.md': '# Inbox',
      'ideas/zeta.md': '# Zeta',
      'ideas/alpha.md': '# Alpha',
      'ideas/ai/agent-memory.md': '# Agent Memory',
      'projects/nabu/roadmap.md': '# Roadmap',
    })

    const root = await getFolderListing('')
    const ideas = await getFolderListing('ideas')
    const nested = await getFolderListing('ideas/ai')

    expect(root).toMatchObject({
      path: '',
      name: '',
      folders: [
        { path: 'ideas', name: 'ideas', noteCount: 3, directNoteCount: 2 },
        { path: 'projects', name: 'projects', noteCount: 1, directNoteCount: 0 },
      ],
      notes: [{ relPath: 'inbox.md' }],
    })

    expect(ideas).toMatchObject({
      path: 'ideas',
      name: 'ideas',
      folders: [{ path: 'ideas/ai', name: 'ai', noteCount: 1, directNoteCount: 1 }],
      notes: [{ relPath: 'ideas/alpha.md' }, { relPath: 'ideas/zeta.md' }],
    })

    expect(nested).toMatchObject({
      path: 'ideas/ai',
      name: 'ai',
      folders: [],
      notes: [{ relPath: 'ideas/ai/agent-memory.md' }],
    })
  })

  it('builds deterministic browse data from folder and note inputs', async () => {
    await createVaultFixture({
      'inbox.md': '# Inbox',
      'ideas/alpha.md': '# Alpha',
      'ideas/zeta.md': '# Zeta',
      'ideas/ai/agent-memory.md': '# Agent Memory',
    })

    const explicit = await getVaultBrowseData({
      folderPath: 'ideas',
      noteSlug: 'zeta',
    })

    expect(explicit.folder.path).toBe('ideas')
    expect(explicit.folder.notes.map((note) => note.slug)).toEqual(['alpha', 'zeta'])
    expect(explicit.selectedNoteSlug).toBe('zeta')
    expect(explicit.note?.relPath).toBe('ideas/zeta.md')

    const invalidFolder = await getVaultBrowseData({
      folderPath: '../secrets',
      noteSlug: '',
    })

    expect(invalidFolder.folder.path).toBe('')
    expect(invalidFolder.selectedNoteSlug).toBe('inbox')
    expect(invalidFolder.note?.relPath).toBe('inbox.md')

    const mismatchedNote = await getVaultBrowseData({
      folderPath: 'ideas',
      noteSlug: 'inbox',
    })

    expect(mismatchedNote.folder.path).toBe('ideas')
    expect(mismatchedNote.selectedNoteSlug).toBe('alpha')
    expect(mismatchedNote.note?.relPath).toBe('ideas/alpha.md')
  })

  it('keeps fallback note selection inside the active folder when slug collisions exist', async () => {
    await createVaultFixture({
      '0-root.md': '---\nslug: shared\n---\n# Root Shared',
      'ideas/a.md': '---\nslug: shared\n---\n# Ideas Shared',
      'ideas/b.md': '# Ideas B',
    })

    const browse = await getVaultBrowseData({
      folderPath: 'ideas',
      noteSlug: '',
    })

    expect(browse.folder.path).toBe('ideas')
    expect(browse.selectedNoteSlug).toBe('shared')
    expect(browse.note?.relPath).toBe('ideas/a.md')
  })

  it('creates folders with deterministic created semantics', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const created = await createVaultFolder('projects/nabu/specs')
    const existing = await createVaultFolder('projects/nabu/specs')

    expect(created).toMatchObject({
      path: 'projects/nabu/specs',
      created: true,
    })
    expect(existing).toMatchObject({
      path: 'projects/nabu/specs',
      created: false,
    })
  })

  it('creates notes and makes them immediately retrievable and searchable', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    const created = await createVaultNote({
      path: 'projects/nabu/specs/agent-operability',
      rawMarkdown: '# Agent Operability\n\nWrite surfaces for agents.',
    })
    const fetched = await getNoteByPath('projects/nabu/specs/agent-operability.md')
    const search = await searchVaultNotes({
      query: 'operability',
    })

    expect(created.note.relPath).toBe('projects/nabu/specs/agent-operability.md')
    expect(fetched?.note.body).toContain('Write surfaces for agents.')
    expect(search.total).toBe(1)
    expect(search.results[0]?.relPath).toBe('projects/nabu/specs/agent-operability.md')
  })

  it('rejects note creation when the target already exists', async () => {
    await createVaultFixture({
      'projects/nabu/specs/agent-operability.md': '# Existing',
    })

    await expect(
      createVaultNote({
        path: 'projects/nabu/specs/agent-operability.md',
        rawMarkdown: '# New content',
      }),
    ).rejects.toThrow('Note already exists')
  })

  it('updates notes and makes updated content immediately searchable', async () => {
    await createVaultFixture({
      'projects/nabu/specs/agent-operability.md': '# Agent Operability\n\nInitial content.',
    })

    const updated = await updateVaultNote({
      path: 'projects/nabu/specs/agent-operability.md',
      rawMarkdown: '# Agent Operability\n\nUpdated memory model.',
    })
    const fetched = await getNoteByPath('projects/nabu/specs/agent-operability.md')
    const search = await searchVaultNotes({
      query: 'updated memory model',
    })

    expect(updated.note.body).toContain('Updated memory model.')
    expect(fetched?.note.body).toContain('Updated memory model.')
    expect(search.results[0]?.relPath).toBe('projects/nabu/specs/agent-operability.md')
  })

  it('rejects note updates when the target note is missing', async () => {
    await createVaultFixture({
      'ideas/seed.md': '# Seed',
    })

    await expect(
      updateVaultNote({
        path: 'projects/nabu/specs/missing.md',
        rawMarkdown: '# Missing',
      }),
    ).rejects.toThrow('Note not found')
  })
})
