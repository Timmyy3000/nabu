import { describe, expect, it } from 'vitest'
import { parseNote, type ParsedVaultNote } from './parse-note'
import { searchVaultIndex } from './search'

function note(relPath: string, rawMarkdown: string): ParsedVaultNote {
  return parseNote({ relPath, rawMarkdown })
}

describe('searchVaultIndex', () => {
  it('ranks exact slug matches above title/body-only matches', () => {
    const results = searchVaultIndex({
      notes: [
        note('infra/dokploy.md', '---\ntitle: Deploy note\n---\nNo mention.'),
        note('infra/deploy.md', '---\ntitle: Dokploy deployment\n---\nNo mention.'),
      ],
      query: 'dokploy',
      path: '',
      limit: 20,
      offset: 0,
    })

    expect(results.results.map((entry) => entry.relPath)).toEqual(['infra/dokploy.md', 'infra/deploy.md'])
    expect(results.results[0]?.reasons).toContain('slug-exact')
  })

  it('ranks exact title matches above body-only matches', () => {
    const results = searchVaultIndex({
      notes: [
        note('ideas/agent-memory.md', '---\ntitle: Agent Memory\n---\nOne'),
        note('ideas/random.md', '---\ntitle: Random\n---\nThis body talks about agent memory for context.'),
      ],
      query: 'agent memory',
      path: '',
      limit: 20,
      offset: 0,
    })

    expect(results.results.map((entry) => entry.relPath)).toEqual(['ideas/agent-memory.md', 'ideas/random.md'])
    expect(results.results[0]?.reasons).toContain('title-exact')
  })

  it('boosts exact phrase matches in summary/body', () => {
    const results = searchVaultIndex({
      notes: [
        note('security/one.md', '---\nsummary: We enforce password auth in prod.\n---\ncontent'),
        note('security/two.md', '---\nsummary: Password checks happen.\n---\nAuth only in staging.'),
      ],
      query: 'password auth',
      path: '',
      limit: 20,
      offset: 0,
    })

    expect(results.results.map((entry) => entry.relPath)).toEqual(['security/one.md', 'security/two.md'])
    expect(results.results[0]?.reasons).toContain('phrase')
  })

  it('applies deterministic token contribution caps for summary/body', () => {
    const results = searchVaultIndex({
      notes: [
        note(
          'ideas/caps.md',
          '---\ntitle: Cap test\nsummary: alpha beta gamma delta epsilon zeta\n---\nalpha and beta and gamma and delta and epsilon and zeta are all here.',
        ),
      ],
      query: 'alpha zeta beta gamma delta epsilon',
      path: '',
      limit: 20,
      offset: 0,
    })

    expect(results.results).toHaveLength(1)
    expect(results.results[0]?.score).toBe(79)
    expect(results.results[0]?.reasons).toEqual(expect.arrayContaining(['summary-token', 'body-token']))
  })

  it('filters to notes under the requested path scope', () => {
    const results = searchVaultIndex({
      notes: [
        note('ideas/a.md', '---\ntitle: Searchable\n---\nalpha beta'),
        note('projects/a.md', '---\ntitle: Searchable\n---\nalpha beta'),
      ],
      query: 'alpha',
      path: 'ideas',
      limit: 20,
      offset: 0,
    })

    expect(results.results.map((entry) => entry.relPath)).toEqual(['ideas/a.md'])
    expect(results.results[0]?.reasons).toContain('path-scope')
  })

  it('returns empty results for unknown path scope', () => {
    const results = searchVaultIndex({
      notes: [note('ideas/a.md', '# A')],
      query: 'a',
      path: 'missing',
      limit: 20,
      offset: 0,
    })

    expect(results.total).toBe(0)
    expect(results.results).toEqual([])
  })

  it('builds snippets around the first phrase/token match', () => {
    const results = searchVaultIndex({
      notes: [
        note(
          'ideas/snippet.md',
          '---\ntitle: Snippet\n---\nThis note has a lot of prefatory text before the key phrase password auth appears in the middle of this paragraph for testing snippet extraction.',
        ),
      ],
      query: 'password auth',
      path: '',
      limit: 20,
      offset: 0,
    })

    expect(results.results).toHaveLength(1)
    expect(results.results[0]?.snippet.toLowerCase()).toContain('password auth')
    expect(results.results[0]?.snippet.length).toBeLessThan(170)
  })

  it('uses deterministic ordering for ties', () => {
    const results = searchVaultIndex({
      notes: [
        note('b/note.md', '---\ntitle: Same\n---\ntoken'),
        note('a/note.md', '---\ntitle: Same\n---\ntoken'),
      ],
      query: 'token',
      path: '',
      limit: 20,
      offset: 0,
    })

    expect(results.results.map((entry) => entry.relPath)).toEqual(['a/note.md', 'b/note.md'])
  })
})
