import { describe, expect, it } from 'vitest'
import { parseNote, type ParsedVaultNote } from './parse-note'
import { buildVaultIndex } from './index'

function note(relPath: string, rawMarkdown: string): ParsedVaultNote {
  return parseNote({ relPath, rawMarkdown })
}

describe('buildVaultIndex', () => {
  it('builds notes in deterministic relPath order regardless of input order', () => {
    const notes = [
      note('zeta.md', '# Zeta'),
      note('ideas/ai/agent-memory.md', '# Agent Memory'),
      note('alpha.md', '# Alpha'),
    ]

    const index = buildVaultIndex([notes[0], notes[2], notes[1]])

    expect(index.notes.map((entry) => entry.relPath)).toEqual([
      'alpha.md',
      'ideas/ai/agent-memory.md',
      'zeta.md',
    ])
  })

  it('indexes notes by relPath', () => {
    const notes = [note('projects/nabu/roadmap.md', '# Roadmap')]
    const index = buildVaultIndex(notes)

    expect(index.byRelPath.get('projects/nabu/roadmap.md')?.title).toBe('Roadmap')
    expect(index.byRelPath.get('projects/missing.md')).toBeUndefined()
  })

  it('indexes notes by slug and tracks duplicate slug collisions deterministically', () => {
    const notes = [
      note('ideas/a/agent-memory.md', '---\nslug: shared\n---\nA'),
      note('ideas/b/agent-memory.md', '---\nslug: shared\n---\nB'),
      note('ideas/c/agent-memory.md', '---\nslug: unique\n---\nC'),
    ]

    const index = buildVaultIndex([notes[1], notes[2], notes[0]])

    expect(index.bySlug.get('shared')?.relPath).toBe('ideas/a/agent-memory.md')
    expect(index.bySlug.get('unique')?.relPath).toBe('ideas/c/agent-memory.md')
    expect(index.slugCollisions.get('shared')).toEqual([
      'ideas/a/agent-memory.md',
      'ideas/b/agent-memory.md',
    ])
    expect(index.stats.collisionCount).toBe(1)
  })

  it('extracts folders as normalized unique paths', () => {
    const notes = [
      note('README.md', '# Home'),
      note('ideas/ai/agent-memory.md', '# One'),
      note('ideas/notes.md', '# Two'),
      note('projects/nabu/roadmap.md', '# Three'),
    ]

    const index = buildVaultIndex(notes)

    expect(index.folders).toEqual(['ideas', 'ideas/ai', 'projects', 'projects/nabu'])
    expect(index.stats.folderCount).toBe(4)
  })

  it('unions real folder paths so empty persisted folders are indexed', () => {
    const notes = [note('projects/nabu/roadmap.md', '# Roadmap')]

    const index = buildVaultIndex(notes, {
      folderPaths: ['ideas', 'projects', 'projects/empty', 'projects/nabu'],
    })

    expect(index.folders).toEqual(['ideas', 'projects', 'projects/empty', 'projects/nabu'])
    expect(index.stats.folderCount).toBe(4)
  })

  it('builds a tag map to note paths with deterministic ordering', () => {
    const notes = [
      note('ideas/a.md', '---\ntags: [AI, memory]\n---\nA'),
      note('ideas/b.md', '---\ntags: memory\n---\nB'),
      note('ideas/c.md', '---\ntags: [systems]\n---\nC'),
    ]

    const index = buildVaultIndex([notes[2], notes[1], notes[0]])

    expect(index.tags.get('memory')).toEqual(['ideas/a.md', 'ideas/b.md'])
    expect(index.tags.get('ai')).toEqual(['ideas/a.md'])
    expect(index.tags.get('systems')).toEqual(['ideas/c.md'])
    expect(index.stats.tagCount).toBe(3)
  })

  it('resolves wiki-links and markdown note links against the index', () => {
    const notes = [
      note(
        'ideas/source.md',
        [
          '[[projects/roadmap.md]]',
          '[[projects/vision]]',
          '[[roadmap]]',
          '[[Product Vision]]',
          '[[Unknown Note]]',
          '[Roadmap](../projects/roadmap.md)',
          '[Missing](../projects/missing.md)',
        ].join('\n'),
      ),
      note('projects/roadmap.md', '---\nslug: roadmap\n---\n# Roadmap'),
      note('projects/vision.md', '---\ntitle: Product Vision\n---\n# Vision'),
    ]

    const index = buildVaultIndex(notes)
    const source = index.byRelPath.get('ideas/source.md')

    expect(source?.outgoingLinks).toEqual([
      {
        raw: '[[projects/roadmap.md]]',
        kind: 'wiki',
        text: null,
        target: 'projects/roadmap.md',
        resolved: true,
        targetRelPath: 'projects/roadmap.md',
        targetSlug: 'roadmap',
      },
      {
        raw: '[[projects/vision]]',
        kind: 'wiki',
        text: null,
        target: 'projects/vision',
        resolved: true,
        targetRelPath: 'projects/vision.md',
        targetSlug: 'vision',
      },
      {
        raw: '[[roadmap]]',
        kind: 'wiki',
        text: null,
        target: 'roadmap',
        resolved: true,
        targetRelPath: 'projects/roadmap.md',
        targetSlug: 'roadmap',
      },
      {
        raw: '[[Product Vision]]',
        kind: 'wiki',
        text: null,
        target: 'Product Vision',
        resolved: true,
        targetRelPath: 'projects/vision.md',
        targetSlug: 'vision',
      },
      {
        raw: '[[Unknown Note]]',
        kind: 'wiki',
        text: null,
        target: 'Unknown Note',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
      {
        raw: '[Roadmap](../projects/roadmap.md)',
        kind: 'markdown',
        text: 'Roadmap',
        target: '../projects/roadmap.md',
        resolved: true,
        targetRelPath: 'projects/roadmap.md',
        targetSlug: 'roadmap',
      },
      {
        raw: '[Missing](../projects/missing.md)',
        kind: 'markdown',
        text: 'Missing',
        target: '../projects/missing.md',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
    ])
  })

  it('keeps ambiguous wiki title matches unresolved', () => {
    const notes = [
      note('ideas/source.md', '[[Shared Title]]'),
      note('projects/one.md', '---\ntitle: Shared Title\n---\n# One'),
      note('projects/two.md', '---\ntitle: Shared Title\n---\n# Two'),
    ]

    const index = buildVaultIndex(notes)
    const source = index.byRelPath.get('ideas/source.md')

    expect(source?.outgoingLinks).toEqual([
      {
        raw: '[[Shared Title]]',
        kind: 'wiki',
        text: null,
        target: 'Shared Title',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
    ])
  })

  it('builds backlink entries from resolved outgoing links only', () => {
    const notes = [
      note(
        'ideas/source-a.md',
        [
          '[[Roadmap]]',
          '[Roadmap Doc](../projects/roadmap.md)',
          '[[Roadmap]]',
          '[[Missing]]',
        ].join('\n'),
      ),
      note('ideas/source-b.md', '[[projects/roadmap.md]]'),
      note('projects/roadmap.md', '---\ntitle: Product Roadmap\nslug: roadmap\n---\n# Roadmap'),
    ]

    const index = buildVaultIndex(notes)

    expect(index.backlinksByTargetRelPath.get('projects/roadmap.md')).toEqual([
      {
        sourceRelPath: 'ideas/source-a.md',
        sourceSlug: 'source-a',
        sourceTitle: 'Source A',
        kind: 'markdown',
        text: 'Roadmap Doc',
        raw: '[Roadmap Doc](../projects/roadmap.md)',
      },
      {
        sourceRelPath: 'ideas/source-a.md',
        sourceSlug: 'source-a',
        sourceTitle: 'Source A',
        kind: 'wiki',
        text: null,
        raw: '[[Roadmap]]',
      },
      {
        sourceRelPath: 'ideas/source-a.md',
        sourceSlug: 'source-a',
        sourceTitle: 'Source A',
        kind: 'wiki',
        text: null,
        raw: '[[Roadmap]]',
      },
      {
        sourceRelPath: 'ideas/source-b.md',
        sourceSlug: 'source-b',
        sourceTitle: 'Source B',
        kind: 'wiki',
        text: null,
        raw: '[[projects/roadmap.md]]',
      },
    ])
    expect(index.backlinksByTargetRelPath.get('ideas/missing.md')).toBeUndefined()
    expect(index.resolvedOutgoingBySourceRelPath.get('ideas/source-a.md')).toHaveLength(3)
    expect(index.unresolvedOutgoingBySourceRelPath.get('ideas/source-a.md')).toEqual([
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
  })
})
