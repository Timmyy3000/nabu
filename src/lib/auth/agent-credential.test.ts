import { describe, expect, it } from 'vitest'
import { deriveAgentCredential } from './agent-credential'

describe('agent credential derivation', () => {
  it('derives the versioned credential for the shared password contract', () => {
    expect(deriveAgentCredential('test-password')).toBe('_1E314UxXoU87rnvX3pXm5r5vQxkHXvHIjrf8_ACrmI')
  })

  it('does not accept an empty password', () => {
    expect(() => deriveAgentCredential('   ')).toThrow('NABU_PASSWORD is required')
  })
})
