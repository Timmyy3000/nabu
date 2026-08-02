import { describe, expect, it } from 'vitest'
import { hashVaultNote, hashVaultRawMarkdown } from './content-hash'

describe('vault content hashes', () => {
  it('keeps legacy hashes stable when a note includes its revision', () => {
    const note = {
      relPath: 'little-helpers/note.md',
      title: 'Note',
      body: '# Note',
    }

    expect(hashVaultNote(note)).toBe(hashVaultNote({ ...note, revision: 'a'.repeat(64) }))
    expect(hashVaultNote({ note })).toBe(hashVaultNote({ note: { ...note, revision: 'b'.repeat(64) } }))
  })
  it('keeps parsed note hashes stable when human source fields are added', () => {
    const parsedNote = {
      relPath: 'ideas/alpha.md',
      title: 'Alpha',
      body: '# Alpha',
    }

    expect(
      hashVaultNote({
        ...parsedNote,
        rawMarkdown: '# Alpha',
        rawContentHash: hashVaultRawMarkdown('# Alpha'),
      }),
    ).toBe(hashVaultNote(parsedNote))
  })
})
