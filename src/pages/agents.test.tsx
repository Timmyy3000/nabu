import { describe, expect, it } from 'vitest'
import { renderAgentsMarkdown } from './agents'

describe('renderAgentsMarkdown', () => {
  it('renders the complete public contract for agents', () => {
    const markdown = renderAgentsMarkdown('https://nabu.timi.click')

    expect(markdown).toContain('# /agents.md')
    expect(markdown).toContain('POST /api/auth/login')
    expect(markdown).toContain('Read this route before touching the browser UI.')
    expect(markdown).toContain('Do not use browser automation or browser-use for normal note operations.')
    expect(markdown).toContain('https://nabu.timi.click/api/auth/login')
    expect(markdown).toContain('Use `rawMarkdown`, not top-level `body` or `content`.')
    expect(markdown).toContain('Local command: npm run mcp')
    expect(markdown).toContain('NABU_MCP_MODE=remote')
    expect(markdown).toContain('NABU_PASSWORD')
    expect(markdown).not.toContain('NABU_AGENT_TOKEN')
    expect(markdown).toContain('PATCH /api/vault/notes/by-path')
    expect(markdown).toContain('GET /api/vault/assets?path=')
    expect(markdown).toContain('Issue a read-only URL token')
    expect(markdown).toContain('POST https://nabu.timi.click/api/shared-spaces/:sharedSpaceId/read-link')
    expect(markdown).toContain('Issuing another token immediately invalidates the previous one.')
    expect(markdown).toContain('between 1 and 183 days')
    expect(markdown).not.toContain('maximum of 30 days')
    expect(markdown).toContain('Shared space unavailable')
    expect(markdown).toContain('The JSON field is exactly `inviteUrl`')
    expect(markdown).toContain('410 SHARED_SPACE_INVITE_INVALID')
    expect(markdown).toContain('If the deployment runs multiple instances')
    expect(markdown).not.toContain('<html')
  })

})
