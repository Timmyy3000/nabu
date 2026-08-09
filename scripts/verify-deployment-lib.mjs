function assertNoRedirect(response, label) {
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${label} redirected; deployment verification fails closed on redirects`)
  }
}

async function fetchChecked(fetchImpl, url, label, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs)
  let response
  try {
    response = await fetchImpl(url, { redirect: 'manual', signal })
  } catch (error) {
    if (signal.aborted) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`, { cause: error })
    }
    throw error
  }
  assertNoRedirect(response, label)
  if (!response.ok) {
    throw new Error(`${label} request failed with ${response.status}`)
  }
  return response
}

function collectLocalAssets(html, origin) {
  const candidates = []
  let hasExecutableBootstrap = false
  const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1]
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0]
    const rel = attribute(tag, 'rel')?.toLowerCase().split(/\s+/) ?? []
    const href = attribute(tag, 'href')
    if (href && (rel.includes('stylesheet') || rel.includes('modulepreload'))) {
      candidates.push({ href, kind: rel.includes('stylesheet') ? 'stylesheet' : 'preload' })
    }
  }
  for (const match of html.matchAll(/<script\b([^>]*?)(?:>([\s\S]*?)<\/script\s*>|\/?>)/gi)) {
    const attributes = match[1] ?? ''
    const src = attribute(attributes, 'src')
    if (src) {
      const url = new URL(src, origin)
      if (url.origin === origin.origin) {
        candidates.push({ href: src, kind: 'script' })
        hasExecutableBootstrap = true
      }
    } else if (attribute(attributes, 'type')?.trim().toLowerCase() === 'module' && match[2]?.trim()) {
      hasExecutableBootstrap = true
    }
  }

  return {
    assets: candidates.flatMap((candidate) => {
      const url = new URL(candidate.href, origin)
      if (url.origin !== origin.origin) {
        return []
      }
      return [{ ...candidate, url }]
    }),
    hasExecutableBootstrap,
  }
}

export async function verifyDeployment(baseUrl, fetchImpl = fetch, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000
  const origin = new URL(baseUrl)
  const pageUrl = new URL('/login?redirect=&error=', origin)
  const pageResponse = await fetchChecked(fetchImpl, pageUrl, 'Login page', timeoutMs)
  const pageType = pageResponse.headers.get('content-type') ?? ''
  if (!pageType.includes('text/html')) {
    throw new Error(`Login page returned the wrong content type: ${pageType || 'missing'}`)
  }

  const html = await pageResponse.text()
  const { assets, hasExecutableBootstrap } = collectLocalAssets(html, origin)
  if (!assets.some((asset) => asset.kind === 'stylesheet')) {
    throw new Error('Login page did not reference a local stylesheet')
  }
  if (!hasExecutableBootstrap) {
    throw new Error('Login page did not reference a local JavaScript asset')
  }
  if (!assets.some((asset) => asset.kind === 'script' || asset.kind === 'preload')) {
    throw new Error('Login page did not reference a local JavaScript asset')
  }

  const stylesheetBodies = []
  for (const asset of assets) {
    const label = asset.kind === 'stylesheet'
      ? 'stylesheet'
      : asset.kind === 'preload'
        ? 'JavaScript module preload'
        : 'JavaScript'
    const response = await fetchChecked(fetchImpl, asset.url, label, timeoutMs)
    const contentType = response.headers.get('content-type') ?? ''
    const body = await response.text()
    if (asset.kind === 'stylesheet') {
      if (!contentType.includes('text/css')) {
        throw new Error(`Stylesheet returned the wrong content type: ${contentType || 'missing'}`)
      }
      stylesheetBodies.push(body)
    } else if (!/(?:java|ecma)script/i.test(contentType)) {
      throw new Error(`JavaScript asset returned the wrong content type: ${contentType || 'missing'}`)
    }
  }
  const combinedStylesheets = stylesheetBodies.join('\n')
  for (const selector of ['.app-shell', '.vault-shell']) {
    if (!combinedStylesheets.includes(selector)) {
      throw new Error(`Stylesheet set is missing the Nabu selector ${selector}`)
    }
  }

  const healthResponse = await fetchChecked(fetchImpl, new URL('/api/health', origin), 'Health endpoint', timeoutMs)
  const health = await healthResponse.json()
  if (health.status !== 'ok' || health.storage !== 'ready') {
    throw new Error('Health endpoint did not report application and storage readiness')
  }

  return {
    baseUrl: origin.origin,
    assets: assets.map((asset) => `${asset.url.pathname}${asset.url.search}`),
    health,
  }
}
