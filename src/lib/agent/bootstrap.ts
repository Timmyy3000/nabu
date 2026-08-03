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
  mcp: {
    localCommand: 'npm run mcp'
    directEnvironment: ['NABU_MCP_MODE=direct', 'KNOWLEDGE_PATH=<absolute-vault-path>']
    remoteEnvironment: ['NABU_MCP_MODE=remote', 'NABU_URL=<https-url>', 'NABU_PASSWORD=<same-password-as-Nabu>']
    transport: 'stdio'
    nativeRemoteEndpoint: 'separate follow-up'
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
    mcp: {
      localCommand: 'npm run mcp',
      directEnvironment: ['NABU_MCP_MODE=direct', 'KNOWLEDGE_PATH=<absolute-vault-path>'],
      remoteEnvironment: ['NABU_MCP_MODE=remote', 'NABU_URL=<https-url>', 'NABU_PASSWORD=<same-password-as-Nabu>'],
      transport: 'stdio',
      nativeRemoteEndpoint: 'separate follow-up',
    },
  }
}
