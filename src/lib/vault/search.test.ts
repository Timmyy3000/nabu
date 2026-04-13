import { describe, expect, it } from 'vitest'
import { parseNote, type ParsedVaultNote } from './parse-note'
import { normalizeSearchQuery, searchVaultIndex } from './search'

function note(relPath: string, rawMarkdown: string): ParsedVaultNote {
  return parseNote({ relPath, rawMarkdown })
}

describe('normalizeSearchQuery', () => {
  it('parses plain lexical queries into tokens', () => {
    expect(normalizeSearchQuery(' Agent   Memory ')).toMatchObject({
      query: 'Agent   Memory',
      normalizedQuery: 'agent memory',
      exactPhrases: [],
      tokens: ['agent', 'memory'],
    })
  })

  it('parses balanced quoted phrases as exact phrases', () => {
    expect(normalizeSearchQuery('deploy "bind mount" dokploy')).toMatchObject({
      normalizedQuery: 'deploy bind mount dokploy',
      exactPhrases: ['bind mount'],
      tokens: ['deploy', 'dokploy'],
    })
  })

  it('supports phrase-only queries', () => {
    expect(normalizeSearchQuery('"password auth"')).toMatchObject({
      normalizedQuery: 'password auth',
      exactPhrases: ['password auth'],
      tokens: [],
    })
  })

  it('falls back to lexical tokenization for malformed quotes', () => {
    expect(normalizeSearchQuery('deploy "bind mount dokploy')).toMatchObject({
      normalizedQuery: 'deploy bind mount dokploy',
      exactPhrases: [],
      tokens: ['deploy', 'bind', 'mount', 'dokploy'],
    })
  })
})

describe('searchVaultIndex', () => {
  it('ranks exact slug matches above title/body-only matches', () => {
    const results = searchVaultIndex({
      notes: [
        note('infra/dokploy.md', '---\ntitle: Deploy note\n---\nNo mention.'),
        note('infra/deploy.md', '---\ntitle: Dokploy deployment\n---\nNo mention.'),
      ],
      query: 'dokploy',
      path: '',
      tag: null,
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
      tag: null,
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
      tag: null,
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
      tag: null,
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
      tag: null,
      limit: 20,
      offset: 0,
    })

    expect(results.results.map((entry) => entry.relPath)).toEqual(['ideas/a.md'])
    expect(results.results[0]?.reasons).toContain('path-scope')
  })

  it('treats exact phrases as hard constraints', () => {
    const results = searchVaultIndex({
      notes: [
        note('ideas/one.md', '---\ntitle: Deploy note\nsummary: We use bind mount for local data.\n---\nDokploy setup'),
        note('ideas/two.md', '---\ntitle: Deploy note\nsummary: Local data strategy.\n---\nDokploy setup'),
      ],
      query: 'dokploy "bind mount"',
      path: '',
      tag: null,
      limit: 20,
      offset: 0,
    })

    expect(results.total).toBe(1)
    expect(results.results.map((entry) => entry.relPath)).toEqual(['ideas/one.md'])
    expect(results.exactPhrases).toEqual(['bind mount'])
    expect(results.tokens).toEqual(['dokploy'])
  })

  it('filters by exact normalized tag when tag filter is provided', () => {
    const results = searchVaultIndex({
      notes: [
        note('ideas/a.md', '---\ntitle: Agent Memory\ntags: [AI, memory]\n---\nagent'),
        note('ideas/b.md', '---\ntitle: Agent Runtime\ntags: [systems]\n---\nagent'),
      ],
      query: 'agent',
      path: '',
      tag: 'AI',
      limit: 20,
      offset: 0,
    })

    expect(results.total).toBe(1)
    expect(results.tag).toBe('ai')
    expect(results.results.map((entry) => entry.relPath)).toEqual(['ideas/a.md'])
  })

  it('combines path and tag filters deterministically', () => {
    const results = searchVaultIndex({
      notes: [
        note('ideas/a.md', '---\ntitle: Agent Memory\ntags: [ai]\n---\nagent'),
        note('projects/a.md', '---\ntitle: Agent Memory\ntags: [ai]\n---\nagent'),
      ],
      query: 'agent',
      path: 'ideas',
      tag: 'ai',
      limit: 20,
      offset: 0,
    })

    expect(results.total).toBe(1)
    expect(results.results.map((entry) => entry.relPath)).toEqual(['ideas/a.md'])
  })

  it('returns empty results for unknown path scope', () => {
    const results = searchVaultIndex({
      notes: [note('ideas/a.md', '# A')],
      query: 'a',
      path: 'missing',
      tag: null,
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
      tag: null,
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
      tag: null,
      limit: 20,
      offset: 0,
    })

    expect(results.results.map((entry) => entry.relPath)).toEqual(['a/note.md', 'b/note.md'])
  })
})
