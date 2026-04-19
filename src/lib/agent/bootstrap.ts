import { AUTH_COOKIE_NAME } from '../auth/session'

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
  }
}
