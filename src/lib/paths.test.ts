import { describe, expect, it } from 'vitest'
import { normalizeVaultPath } from './paths'

describe('normalizeVaultPath', () => {
  it('normalizes slashes and trims whitespace', () => {
    expect(normalizeVaultPath('  ideas\\ai\\agent-memory.md  ')).toBe('ideas/ai/agent-memory.md')
  })

  it('removes duplicate separators', () => {
    expect(normalizeVaultPath('ideas//ai///agent-memory.md')).toBe('ideas/ai/agent-memory.md')
  })

  it('throws for empty input', () => {
    expect(() => normalizeVaultPath('   ')).toThrow('Path cannot be empty.')
  })

  it('throws for traversal segments', () => {
    expect(() => normalizeVaultPath('../secrets.md')).toThrow('Path traversal segments are not allowed.')
    expect(() => normalizeVaultPath('ideas/../secrets.md')).toThrow('Path traversal segments are not allowed.')
  })

  it('throws for absolute paths', () => {
    expect(() => normalizeVaultPath('/etc/passwd')).toThrow('Absolute paths are not allowed.')
    expect(() => normalizeVaultPath('C:\\vault\\note.md')).toThrow('Absolute paths are not allowed.')
  })
})
