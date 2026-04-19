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
author: ' Claude '
source: ' https://example.com/article '
references:
  - projects/nabu/roadmap.md
  - indexing-primitives
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
      authors: ['Claude'],
      source: 'https://example.com/article',
      references: ['projects/nabu/roadmap.md', 'indexing-primitives'],
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
      title: 'Roadmap',
      slug: 'roadmap',
      summary: null,
      tags: [],
      authors: [],
      source: null,
      references: [],
      createdAt: null,
      updatedAt: null,
      frontmatter: {},
      body: '# Roadmap\n',
      warnings: [],
    })
  })

  it('extracts standardized metadata from the existing body convention when frontmatter is absent', () => {
    const note = parseNote({
      relPath: 'resources/observability/traditional-logging-breaks-down-in-distributed-systems.md',
      rawMarkdown: `# Traditional logging breaks down in distributed systems

**TL;DR:** Distributed systems make scattered log lines useless.

**Author:** claude-opus-4.6
**Source:** https://loggingsucks.com/ — Boris Tane
**Tags:** observability, logging, distributed-systems, concept
**References:** [[wide-events-replace-scattered-log-lines]], [[tail-sampling-controls-observability-costs]]
`,
    })

    expect(note).toMatchObject({
      title: 'Traditional logging breaks down in distributed systems',
      slug: 'traditional-logging-breaks-down-in-distributed-systems',
      summary: 'Distributed systems make scattered log lines useless.',
      authors: ['claude-opus-4.6'],
      source: 'https://loggingsucks.com/ — Boris Tane',
      tags: ['concept', 'distributed-systems', 'logging', 'observability'],
      references: ['wide-events-replace-scattered-log-lines', 'tail-sampling-controls-observability-costs'],
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

  it('extracts wiki-links and internal markdown note links from body', () => {
    const note = parseNote({
      relPath: 'ideas/agent-memory.md',
      rawMarkdown: `# Links
[[Roadmap]]
[[projects/vision|Product Vision]]
[Roadmap Doc](../projects/roadmap.md)
[Vision](../projects/vision.md#focus)
[External](https://example.com/docs)
![Image](../assets/image.png)
`,
    })

    expect(note.outgoingLinks).toEqual([
      {
        raw: '[[Roadmap]]',
        kind: 'wiki',
        text: null,
        target: 'Roadmap',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
      {
        raw: '[[projects/vision|Product Vision]]',
        kind: 'wiki',
        text: 'Product Vision',
        target: 'projects/vision',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
      {
        raw: '[Roadmap Doc](../projects/roadmap.md)',
        kind: 'markdown',
        text: 'Roadmap Doc',
        target: '../projects/roadmap.md',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
      {
        raw: '[Vision](../projects/vision.md#focus)',
        kind: 'markdown',
        text: 'Vision',
        target: '../projects/vision.md#focus',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
    ])
  })

  it('preserves duplicate links and ignores malformed empty wiki-links', () => {
    const note = parseNote({
      relPath: 'ideas/dupes.md',
      rawMarkdown: `[[Roadmap]]\n[[Roadmap]]\n[[]]\n[[   ]]\n`,
    })

    expect(note.outgoingLinks).toEqual([
      {
        raw: '[[Roadmap]]',
        kind: 'wiki',
        text: null,
        target: 'Roadmap',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
      {
        raw: '[[Roadmap]]',
        kind: 'wiki',
        text: null,
        target: 'Roadmap',
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      },
    ])
  })
})
