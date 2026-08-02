import { describe, expect, it } from 'vitest'
import { NABU_AGENT_SKILL_SOURCE, renderAgentsMarkdown } from './agents'

describe('renderAgentsMarkdown', () => {
  it('serves the pinned Nabu skill as the public agent contract', () => {
    const markdown = renderAgentsMarkdown()

    expect(markdown).toContain('# Nabu agent contract')
    expect(markdown).toContain('${NABU_URL}/api/shared-spaces/invites/redeem')
    expect(markdown).toContain('INVITE_URL="<exact-one-time-invite-url>"')
    expect(markdown).toContain('NABU_URL="${INVITE_URL%%/invites/*}"')
    expect(markdown).toContain('accessToken')
    expect(markdown).toContain('approved credential store')
    expect(markdown).toContain('GET the scoped tree')
    expect(markdown).toContain(NABU_AGENT_SKILL_SOURCE)
    expect(markdown).not.toContain('name: nabu')
    expect(markdown).not.toContain("Source: the user's Nabu deployment's `/agents.md` contract.")
    expect(markdown).not.toContain('little-helpers')
    expect(markdown).not.toContain('<html')
  })
})
