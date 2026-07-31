import { bench, describe } from 'vitest'
import { buildVaultIndex } from './index'
import { parseNote } from './parse-note'
import { searchVaultIndex } from './search'

const notes = Array.from({ length: 2000 }, (_, index) =>
  parseNote({
    relPath: `benchmark/${String(index).padStart(4, '0')}.md`,
    rawMarkdown: [
      '---',
      `title: Agent Memory ${index}`,
      'summary: Shared context for reliable agent systems',
      'tags: [ai, benchmark]',
      '---',
      'This body describes searchable agent memory and durable knowledge graph links.',
    ].join('\n'),
  }),
)

const index = buildVaultIndex(notes)
const searchInput = {
  query: 'agent memory',
  path: '',
  tag: null,
  limit: 20,
  offset: 0,
}

describe('vault search projection', () => {
  bench('indexed normalized fields', () => {
    searchVaultIndex({
      notes: index.notes,
      searchDocuments: index.searchDocuments,
      ...searchInput,
    })
  })

  bench('rebuild normalized fields per query', () => {
    searchVaultIndex({
      notes: index.notes,
      ...searchInput,
    })
  })
})
