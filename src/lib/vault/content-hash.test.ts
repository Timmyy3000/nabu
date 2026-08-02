import { describe, expect, it } from 'vitest'
import { hashVaultNote } from './content-hash'

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
})
