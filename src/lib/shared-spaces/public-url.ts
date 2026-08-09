const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export type CanonicalPublicUrlOptions = {
  configuredBaseUrl?: string | null
  requestUrl?: string | null
  allowLoopbackRequest?: boolean
}

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
}

function normalizeUrl(value: string, source: string, allowLoopback: boolean): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`NABU_PUBLIC_URL is invalid (${source})`)
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('NABU_PUBLIC_URL must not include credentials, query, or fragment')
  }
  if (url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && isLoopback(url))) {
    throw new Error('NABU_PUBLIC_URL must use HTTPS (HTTP is allowed only for loopback development)')
  }

  const pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/'
  url.pathname = pathname
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

/**
 * Resolve the single trusted base used for all capability and contract links.
 * Production never accepts a request-derived origin. Development may use a
 * loopback request origin when an explicit public URL is not configured.
 */
export function resolveCanonicalPublicUrl(options: CanonicalPublicUrlOptions = {}): string {
  const production = process.env.NODE_ENV === 'production'
  const configured = options.configuredBaseUrl === undefined
    ? process.env.NABU_PUBLIC_URL?.trim()
    : options.configuredBaseUrl?.trim()

  if (configured) {
    return normalizeUrl(configured, 'configured value', !production)
  }

  if (!production && options.allowLoopbackRequest !== false && options.requestUrl) {
    let request: URL
    try {
      request = new URL(options.requestUrl)
    } catch {
      throw new Error('NABU_PUBLIC_URL is required when the request URL is invalid')
    }
    if (isLoopback(request) && (request.protocol === 'http:' || request.protocol === 'https:')) {
      return normalizeUrl(request.origin, 'loopback request origin', true)
    }
  }

  if (!production && options.allowLoopbackRequest !== false && !options.requestUrl) {
    return 'http://localhost:3000'
  }

  throw new Error('NABU_PUBLIC_URL is required in production and must be a valid canonical URL')
}

export function resolveCanonicalPath(baseUrl: string, relativePath: string): string {
  const base = new URL(`${baseUrl.replace(/\/$/, '')}/`)
  const prefix = base.pathname === '/' ? '' : base.pathname.replace(/\/$/, '')
  const suffix = relativePath.startsWith('/') ? relativePath : `/${relativePath}`
  return `${prefix}${suffix}` || '/'
}

export function resolveCanonicalLink(baseUrl: string, relativePath: string): URL {
  const base = new URL(baseUrl)
  base.pathname = resolveCanonicalPath(baseUrl, relativePath)
  base.search = ''
  base.hash = ''
  return base
}
