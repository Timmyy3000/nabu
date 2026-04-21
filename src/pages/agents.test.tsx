import { describe, expect, it } from 'vitest'
import { renderAgentsMarkdown } from './agents'

describe('renderAgentsMarkdown', () => {
  it('renders a compact bootstrap contract for unauthenticated agents', () => {
    const markdown = renderAgentsMarkdown(false, 'https://nabu.timi.click')

    expect(markdown).toContain('# /agents.md')
    expect(markdown).toContain('POST /api/auth/login')
    expect(markdown).toContain('Read this route before touching the browser UI.')
    expect(markdown).toContain('Do not use browser automation or browser-use for normal note operations.')
    expect(markdown).toContain('https://nabu.timi.click/api/auth/login')
    expect(markdown).toContain('Use `rawMarkdown`, not top-level `body` or `content`.')
    expect(markdown).not.toContain('PATCH /api/vault/notes/by-path')
    expect(markdown).not.toContain('<html')
  })

  it('renders the full authenticated contract in raw markdown', () => {
    const markdown = renderAgentsMarkdown(true, 'https://nabu.timi.click')

    expect(markdown).toContain('PATCH /api/vault/notes/by-path')
    expect(markdown).toContain('DELETE /api/vault/notes/by-path?path=')
    expect(markdown).toContain('DELETE /api/vault/folders?path=')
    expect(markdown).toContain('Read this route before touching the browser UI.')
    expect(markdown).toContain('Use deterministic by-path reads after every mutation.')
    expect(markdown).toContain('https://nabu.timi.click/api/vault/notes/by-path?path=projects/docsyde/sales/icp-findings.md')
    expect(markdown).toContain('When writing notes, prefer canonical frontmatter metadata')
    expect(markdown).toContain('Use `rawMarkdown`, not top-level `body` or `content`.')
    expect(markdown).toContain('Folder delete is empty-only and non-recursive.')
    expect(markdown).not.toContain('<html')
  })
})
