import { createHmac, timingSafeEqual } from 'node:crypto'

export const AUTH_COOKIE_NAME = 'nabu_session'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

type SessionPayload = {
  v: 1
  exp: number
}

function getConfiguredPassword(): string {
  const password = process.env.NABU_PASSWORD?.trim()

  if (!password) {
    throw new Error('NABU_PASSWORD is required')
  }

  return password
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getConfiguredPassword()).update(encodedPayload).digest('base64url')
}

function safeCompare(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

function parseCookies(headerValue: string | null): Map<string, string> {
  const cookies = new Map<string, string>()

  if (!headerValue) {
    return cookies
  }

  for (const part of headerValue.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (!name || valueParts.length === 0) {
      continue
    }

    const rawValue = valueParts.join('=')
    cookies.set(name, decodeURIComponent(rawValue))
  }

  return cookies
}

function createSetCookieHeader(request: Request, token: string, maxAgeSeconds: number): string {
  const isSecure = new URL(request.url).protocol === 'https:'
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Strict',
  ]

  if (isSecure) {
    parts.push('Secure')
  }

  return parts.join('; ')
}

export function sanitizeRedirectPath(redirectTo: string | null | undefined): string {
  if (!redirectTo) {
    return '/'
  }

  if (!redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
    return '/'
  }

  return redirectTo
}

export function verifyPassword(input: string): boolean {
  return safeCompare(input, getConfiguredPassword())
}

export function createSessionToken(nowMs: number = Date.now()): string {
  const payload: SessionPayload = {
    v: 1,
    exp: Math.floor(nowMs / 1_000) + SESSION_MAX_AGE_SECONDS,
  }

  const encodedPayload = encodeBase64Url(JSON.stringify(payload))
  const signature = signPayload(encodedPayload)

  return `${encodedPayload}.${signature}`
}

export function verifySessionToken(token: string, nowMs: number = Date.now()): boolean {
  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    return false
  }

  const expectedSignature = signPayload(encodedPayload)

  if (!safeCompare(signature, expectedSignature)) {
    return false
  }

  let payload: SessionPayload

  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload
  } catch {
    return false
  }

  if (payload.v !== 1 || typeof payload.exp !== 'number') {
    return false
  }

  return payload.exp > Math.floor(nowMs / 1_000)
}

export function isAuthenticatedRequest(request: Request, nowMs: number = Date.now()): boolean {
  try {
    const cookies = parseCookies(request.headers.get('cookie'))
    const token = cookies.get(AUTH_COOKIE_NAME)

    if (!token) {
      return false
    }

    return verifySessionToken(token, nowMs)
  } catch {
    return false
  }
}

export function requireAuthenticatedApiRequest(request: Request, nowMs: number = Date.now()): Response | null {
  if (isAuthenticatedRequest(request, nowMs)) {
    return null
  }

  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}

export function buildLoginResponse(request: Request, redirectTo: string | null | undefined): Response {
  const location = sanitizeRedirectPath(redirectTo)
  const sessionToken = createSessionToken()

  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Set-Cookie': createSetCookieHeader(request, sessionToken, SESSION_MAX_AGE_SECONDS),
    },
  })
}

export function buildFailedLoginResponse(redirectTo: string | null | undefined): Response {
  const safeRedirect = sanitizeRedirectPath(redirectTo)
  const query = new URLSearchParams({ error: '1' })

  if (safeRedirect !== '/') {
    query.set('redirect', safeRedirect)
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: `/login?${query.toString()}`,
    },
  })
}

export function buildLogoutResponse(request: Request): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': createSetCookieHeader(request, '', 0),
    },
  })
}
