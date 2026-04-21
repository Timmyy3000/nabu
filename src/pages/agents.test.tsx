import { describe, expect, it } from 'vitest'
import { renderAgentsMarkdown } from './agents'

describe('renderAgentsMarkdown', () => {
  it('renders a compact bootstrap contract for unauthenticated agents', () => {
    const markdown = renderAgentsMarkdown(false)

    expect(markdown).toContain('# /agents.md')
    expect(markdown).toContain('POST /api/auth/login')
    expect(markdown).toContain('Use `rawMarkdown`, not `body` or `content`.')
    expect(markdown).not.toContain('PATCH /api/vault/notes/by-path')
    expect(markdown).not.toContain('<html')
  })

  it('renders the full authenticated contract in raw markdown', () => {
    const markdown = renderAgentsMarkdown(true)

    expect(markdown).toContain('PATCH /api/vault/notes/by-path')
    expect(markdown).toContain('DELETE /api/vault/notes/by-path?path=')
    expect(markdown).toContain('DELETE /api/vault/folders?path=')
    expect(markdown).toContain('Use `rawMarkdown`, not `body` or `content`.')
    expect(markdown).toContain('Folder delete is empty-only and non-recursive.')
    expect(markdown).not.toContain('<html')
  })
})
