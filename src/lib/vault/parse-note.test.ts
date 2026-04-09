import { describe, expect, it } from 'vitest'
import { parseNote } from './parse-note'

describe('parseNote', () => {
  it('parses frontmatter and normalizes metadata fields', () => {
    const note = parseNote({
      relPath: '  ideas\\ai\\Agent Memory.md  ',
      rawMarkdown: `---
title: '  Agent Memory  '
slug: 'Agent Memory V1'
tags:
  - ' AI '
  - memory
  - ai
summary: ' Shared notes for agents. '
createdAt: '2026-04-09'
updatedAt: '2026-04-09T10:20:30Z'
---
# Heading
\nBody text.
`,
    })

    expect(note).toMatchObject({
      id: 'ideas/ai/Agent Memory.md',
      relPath: 'ideas/ai/Agent Memory.md',
      title: 'Agent Memory',
      slug: 'agent-memory-v1',
      summary: 'Shared notes for agents.',
      tags: ['ai', 'memory'],
      createdAt: '2026-04-09',
      updatedAt: '2026-04-09T10:20:30.000Z',
      frontmatter: {
        title: '  Agent Memory  ',
        slug: 'Agent Memory V1',
      },
      body: '# Heading\n\nBody text.\n',
      warnings: [],
    })
  })

  it('derives defaults when frontmatter metadata is missing', () => {
    const note = parseNote({
      relPath: 'projects/nabu/roadmap.md',
      rawMarkdown: '# Roadmap\n',
    })

    expect(note).toMatchObject({
      id: 'projects/nabu/roadmap.md',
      relPath: 'projects/nabu/roadmap.md',
      title: 'roadmap',
      slug: 'roadmap',
      summary: null,
      tags: [],
      createdAt: null,
      updatedAt: null,
      frontmatter: {},
      body: '# Roadmap\n',
      warnings: [],
    })
  })

  it('normalizes comma-separated tags strings', () => {
    const note = parseNote({
      relPath: 'ideas/tags.md',
      rawMarkdown: `---
tags: 'AI, memory, ai, ,'
---
Hello
`,
    })

    expect(note.tags).toEqual(['ai', 'memory'])
  })

  it('returns raw markdown body and warning when frontmatter is malformed', () => {
    const rawMarkdown = `---
title: [broken
---
# Broken
`

    const note = parseNote({
      relPath: 'ideas/broken.md',
      rawMarkdown,
    })

    expect(note.frontmatter).toEqual({})
    expect(note.body).toBe(rawMarkdown)
    expect(note.warnings).toHaveLength(1)
    expect(note.warnings[0]).toContain('Failed to parse frontmatter')
  })
})
