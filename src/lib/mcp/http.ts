import { createMcpHandler } from '@modelcontextprotocol/server'
import { resolveVaultPrincipal, type VaultPrincipal } from '../auth/authorization'
import { resolveCanonicalPublicUrl } from '../shared-spaces/public-url'
import { createDirectKnowledgeGateway } from './gateway'
import { createNabuMcpServer, type McpSurface } from './server'

const BEARER_PATTERN = /^Bearer\s+(.+)$/i

export type McpRequestContext = {
  principal: VaultPrincipal | null
  surface: McpSurface
}

function jsonError(message: string, status: number, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers })
}

function unauthorizedResponse(): Response {
  return jsonError('Unauthorized', 401, { 'WWW-Authenticate': 'Bearer realm="nabu"' })
}

function forbiddenResponse(message: string): Response {
  return jsonError(message, 403)
}

function resolveOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * Validate the host and browser origin before any MCP request is dispatched.
 * Production uses NABU_PUBLIC_URL; non-production may derive a loopback origin
 * from the request, but never derives a public origin from an arbitrary host.
 */
export function validateMcpRequestOrigin(request: Request): Response | null {
  let canonicalUrl: URL
  try {
    canonicalUrl = new URL(resolveCanonicalPublicUrl({ requestUrl: request.url, allowLoopbackRequest: true }))
  } catch {
    return jsonError('MCP public URL is not configured.', 503)
  }

  const host = request.headers.get('host')
  if (!host || host.trim().toLowerCase() !== canonicalUrl.host.toLowerCase()) {
    return forbiddenResponse('Host header is not allowed.')
  }

  const origin = request.headers.get('origin')
  if (origin && resolveOrigin(origin) !== canonicalUrl.origin) {
    return forbiddenResponse('Origin is not allowed.')
  }

  return null
}

function contextForPrincipal(principal: VaultPrincipal | null): McpRequestContext {
  if (!principal) {
    return { principal: null, surface: 'bootstrap' }
  }

  if (principal.kind === 'owner') {
    return { principal, surface: 'owner' }
  }

  return {
    principal,
    surface: principal.permissions.includes('write') ? 'shared-read-write' : 'shared-read',
  }
}

/**
 * Resolve only the MCP bearer contract. Browser cookies and URL query tokens
 * are intentionally excluded, so invalid bearer credentials can never fall
 * through to another authorization mechanism.
 */
export async function resolveMcpRequestContext(
  request: Request,
  nowMs: number = Date.now(),
): Promise<McpRequestContext | Response> {
  const authorization = request.headers.get('authorization')
  if (authorization === null) {
    return contextForPrincipal(null)
  }

  const match = BEARER_PATTERN.exec(authorization.trim())
  const token = match?.[1]?.trim()
  if (!token) {
    return unauthorizedResponse()
  }

  // resolveVaultPrincipal owns shared-token expiry, revocation, and lease
  // checks. Give it a sanitized request so cookies and URL tokens are ignored.
  const sanitizedUrl = new URL(request.url)
  sanitizedUrl.search = ''
  sanitizedUrl.hash = ''
  const sanitizedRequest = new Request(sanitizedUrl, {
    headers: { authorization: `Bearer ${token}` },
  })

  let principal: VaultPrincipal | null = null
  try {
    principal = await resolveVaultPrincipal(sanitizedRequest, nowMs, '')
  } catch {
    principal = null
  }

  return principal ? contextForPrincipal(principal) : unauthorizedResponse()
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonError('Method not allowed.', 405, { Allow: 'POST' })
  }

  const originError = validateMcpRequestOrigin(request)
  if (originError) {
    return originError
  }

  const context = await resolveMcpRequestContext(request)
  if (context instanceof Response) {
    return context
  }

  const gateway = createDirectKnowledgeGateway(context.principal ?? undefined)
  const handler = createMcpHandler(
    () => createNabuMcpServer(gateway, context.surface),
    { legacy: 'stateless', responseMode: 'auto' },
  )

  return handler.fetch(request)
}
