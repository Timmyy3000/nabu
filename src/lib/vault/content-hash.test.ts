import { describe, expect, it } from 'vitest'
import { hashVaultNote, hashVaultRawMarkdown } from './content-hash'

describe('vault content hashes', () => {
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
