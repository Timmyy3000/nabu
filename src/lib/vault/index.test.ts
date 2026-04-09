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

    expect(index.byRelPath.get('projects/nabu/roadmap.md')?.title).toBe('roadmap')
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
})
