import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  buildFailedLoginResponse,
  buildLoginResponse,
  buildLogoutResponse,
  createSessionToken,
  isAuthenticatedRequest,
  requireAuthenticatedApiRequest,
  sanitizeRedirectPath,
  verifySessionToken,
} from './session'

const ORIGINAL_PASSWORD = process.env.NABU_PASSWORD

beforeEach(() => {
  process.env.NABU_PASSWORD = 'test-password'
})

afterEach(() => {
  process.env.NABU_PASSWORD = ORIGINAL_PASSWORD
})

describe('session auth', () => {
  it('creates and validates a signed session token', () => {
    const token = createSessionToken(1_000)

    expect(verifySessionToken(token, 2_000)).toBe(true)
    expect(verifySessionToken(token, 1_000 + (SESSION_MAX_AGE_SECONDS + 1) * 1_000)).toBe(false)
  })

  it('rejects tampered session tokens', () => {
    const token = createSessionToken(1_000)
    const tampered = `${token}x`

    expect(verifySessionToken(tampered, 2_000)).toBe(false)
  })

  it('authenticates request cookies and returns 401 when absent', () => {
    const token = createSessionToken(1_000)
    const request = new Request('http://localhost:3000/api/vault/tree', {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
      },
    })

    expect(isAuthenticatedRequest(request, 2_000)).toBe(true)
    expect(requireAuthenticatedApiRequest(request, 2_000)).toBeNull()

    const unauthenticated = new Request('http://localhost:3000/api/vault/tree')
    const unauthorizedResponse = requireAuthenticatedApiRequest(unauthenticated, 2_000)

    expect(isAuthenticatedRequest(unauthenticated, 2_000)).toBe(false)
    expect(unauthorizedResponse?.status).toBe(401)
  })

  it('builds login success and logout responses with cookies', () => {
    const loginRequest = new Request('https://nabu.local/api/auth/login')
    const loginResponse = buildLoginResponse(loginRequest, '/projects')

    expect(loginResponse.status).toBe(302)
    expect(loginResponse.headers.get('Location')).toBe('/projects')
    expect(loginResponse.headers.get('Set-Cookie')).toContain(`${AUTH_COOKIE_NAME}=`)
    expect(loginResponse.headers.get('Set-Cookie')).toContain('HttpOnly')
    expect(loginResponse.headers.get('Set-Cookie')).toContain('Secure')
    expect(loginResponse.headers.get('Set-Cookie')).toContain('SameSite=Strict')

    const logoutRequest = new Request('http://localhost:3000/logout')
    const logoutResponse = buildLogoutResponse(logoutRequest)

    expect(logoutResponse.status).toBe(302)
    expect(logoutResponse.headers.get('Location')).toBe('/login')
    expect(logoutResponse.headers.get('Set-Cookie')).toContain('Max-Age=0')
  })

  it('builds failed login redirect with safe redirect fallback', () => {
    const failed = buildFailedLoginResponse('https://evil.example/phish')

    expect(failed.status).toBe(302)
    expect(failed.headers.get('Location')).toBe('/login?error=1')
  })

  it('sanitizes redirect paths', () => {
    expect(sanitizeRedirectPath('/')).toBe('/')
    expect(sanitizeRedirectPath('/?folder=ideas')).toBe('/?folder=ideas')
    expect(sanitizeRedirectPath('https://evil.example')).toBe('/')
    expect(sanitizeRedirectPath('//evil.example')).toBe('/')
    expect(sanitizeRedirectPath('')).toBe('/')
  })
})
