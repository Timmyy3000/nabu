import { AUTH_COOKIE_NAME } from '../auth/constants'

export type AgentBootstrapContract = {
  auth: {
    method: 'POST'
    endpoint: '/api/auth/login'
    contentType: 'application/x-www-form-urlencoded'
    fields: ['password', 'redirect']
    cookieName: string
    redirectBehavior: '302 redirect with session cookie'
  }
  identity: {
    canonical: 'relPath'
    deterministicRead: '/api/vault/notes/by-path?path='
    convenienceRead: '/api/vault/notes/$slug'
    note: string
  }
  sharedSpaces: {
    proposal: '/api/shared-spaces/proposals'
    confirmation: '/api/shared-spaces/'
    redemption: '/api/shared-spaces/invites/redeem'
    note: string
  }
  ownerAgentConnections: {
    issue: '/api/agent/connections'
    redemption: '/api/agent/connections/redeem'
    handoff: '/connect/agent/<secret>'
    note: string
  }
  revisions: {
    etag: 'ETag'
    writeHeader: 'If-Match'
    bodyField: 'expectedRevision'
    note: string
  }
  mcp: {
    localCommand: 'npm run mcp'
    directEnvironment: ['NABU_MCP_MODE=direct', 'KNOWLEDGE_PATH=<absolute-vault-path>']
    remoteEnvironment: ['NABU_MCP_MODE=remote', 'NABU_URL=<https-url>', 'NABU_AGENT_TOKEN=<issued-credential> or NABU_PASSWORD=<same-password-as-Nabu>']
    transport: 'stdio'
    nativeRemoteEndpoint: '/mcp'
    nativeRemoteTransport: 'streamable-http-stateless'
    nativeRemoteAuth: 'Authorization: Bearer'
    bootstrap: 'No Authorization header exposes only redeem_shared_space_invite; persist the returned scoped token.'
  }
}

export function getAgentBootstrapContract(): AgentBootstrapContract {
  return {
    auth: {
      method: 'POST',
      endpoint: '/api/auth/login',
      contentType: 'application/x-www-form-urlencoded',
      fields: ['password', 'redirect'],
      cookieName: AUTH_COOKIE_NAME,
      redirectBehavior: '302 redirect with session cookie',
    },
    identity: {
      canonical: 'relPath',
      deterministicRead: '/api/vault/notes/by-path?path=',
      convenienceRead: '/api/vault/notes/$slug',
      note: 'Use relPath as the canonical note identity. Slug lookup is convenience-only and may collide.',
    },
    sharedSpaces: {
      proposal: '/api/shared-spaces/proposals',
      confirmation: '/api/shared-spaces/',
      redemption: '/api/shared-spaces/invites/redeem',
      note: 'Shared spaces are temporary, live recursive knowledge boundaries. Redeemed access tokens are scoped to one root and expire with its lease.',
    },
    ownerAgentConnections: {
      issue: '/api/agent/connections',
      redemption: '/api/agent/connections/redeem',
      handoff: '/connect/agent/<secret>',
      note: 'A human owner can issue a short-lived one-time connection URL in Settings. Redeem it once to receive a durable permission-scoped owner-agent credential; the durable credential is never in the URL.',
    },
    revisions: {
      etag: 'ETag',
      writeHeader: 'If-Match',
      bodyField: 'expectedRevision',
      note: 'Read the note, preserve its revision, and send it on update or move. A stale revision returns 409 so the agent can re-read, merge, and retry.',
    },
    mcp: {
      localCommand: 'npm run mcp',
      directEnvironment: ['NABU_MCP_MODE=direct', 'KNOWLEDGE_PATH=<absolute-vault-path>'],
      remoteEnvironment: ['NABU_MCP_MODE=remote', 'NABU_URL=<https-url>', 'NABU_AGENT_TOKEN=<issued-credential> or NABU_PASSWORD=<same-password-as-Nabu>'],
      transport: 'stdio',
      nativeRemoteEndpoint: '/mcp',
      nativeRemoteTransport: 'streamable-http-stateless',
      nativeRemoteAuth: 'Authorization: Bearer',
      bootstrap: 'No Authorization header exposes only redeem_shared_space_invite; persist the returned scoped token.',
    },
  }
}
