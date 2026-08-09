import { describe, expect, it, vi } from 'vitest'
import { verifyDeployment } from './verify-deployment-lib.mjs'

const baseUrl = 'https://nabu.example'

function response(body, init = {}) {
  return new Response(body, { status: 200, ...init })
}

function deploymentFetch(overrides = {}) {
  const responses = {
    [`${baseUrl}/login?redirect=&error=`]: response(
      '<link rel="preconnect" href="https://fonts.example"><link rel="stylesheet" href="https://fonts.example/font.css"><link href="/assets/styles-good.css" rel="stylesheet"><script type="module" src="/assets/app-good.js"></script>',
      { headers: { 'content-type': 'text/html' } },
    ),
    [`${baseUrl}/assets/styles-good.css`]: response('.app-shell{}.vault-shell{}', {
      headers: { 'content-type': 'text/css' },
    }),
    [`${baseUrl}/assets/app-good.js`]: response('export {}', {
      headers: { 'content-type': 'text/javascript' },
    }),
    [`${baseUrl}/api/health`]: response(JSON.stringify({ status: 'ok', storage: 'ready' }), {
      headers: { 'content-type': 'application/json' },
    }),
    ...overrides,
  }

  return vi.fn(async (input) => responses[String(input)] ?? response('missing', { status: 404 }))
}

describe('verifyDeployment', () => {
  it('verifies the deployed HTML, CSS, JavaScript, and health response', async () => {
    const result = await verifyDeployment(baseUrl, deploymentFetch())

    expect(result.assets).toEqual([
      '/assets/styles-good.css',
      '/assets/app-good.js',
    ])
  })

  it.each([
    ['missing stylesheet', response('missing', { status: 404 })],
    ['HTML fallback', response('<!doctype html><title>fallback</title>', { headers: { 'content-type': 'text/html' } })],
  ])('fails when health is ready but the deployed CSS is a %s', async (_label, brokenCss) => {
    const fetchImpl = deploymentFetch({ [`${baseUrl}/assets/styles-good.css`]: brokenCss })

    await expect(verifyDeployment(baseUrl, fetchImpl)).rejects.toThrow(/stylesheet/i)
  })

  it('fails closed when a local asset redirects', async () => {
    const redirected = response('', { status: 302, headers: { location: 'https://cdn.example/app.js' } })
    const fetchImpl = deploymentFetch({ [`${baseUrl}/assets/app-good.js`]: redirected })

    await expect(verifyDeployment(baseUrl, fetchImpl)).rejects.toThrow(/redirect/i)
  })

  it('fails when the page does not reference a local JavaScript asset', async () => {
    const pageWithoutJavaScript = response('<link rel="stylesheet" href="/assets/styles-good.css">', {
      headers: { 'content-type': 'text/html' },
    })
    const fetchImpl = deploymentFetch({ [`${baseUrl}/login?redirect=&error=`]: pageWithoutJavaScript })

    await expect(verifyDeployment(baseUrl, fetchImpl)).rejects.toThrow(/JavaScript/i)
  })

  it('does not treat a module preload as an executable JavaScript asset', async () => {
    const preloadOnly = response(
      '<link rel="stylesheet" href="/assets/styles-good.css"><link rel="modulepreload" href="/assets/app-good.js">',
      { headers: { 'content-type': 'text/html' } },
    )
    const fetchImpl = deploymentFetch({ [`${baseUrl}/login?redirect=&error=`]: preloadOnly })

    await expect(verifyDeployment(baseUrl, fetchImpl)).rejects.toThrow(/JavaScript/i)
  })

  it('accepts a non-empty inline module bootstrap and validates local module preloads', async () => {
    const inlineModule = response(
      '<link rel="stylesheet" href="/assets/styles-good.css"><link rel="modulepreload" href="/assets/chunk-good.js"><script type="module">import \'/assets/chunk-good.js\'</script>',
      { headers: { 'content-type': 'text/html' } },
    )
    const fetchImpl = deploymentFetch({
      [`${baseUrl}/login?redirect=&error=`]: inlineModule,
      [`${baseUrl}/assets/chunk-good.js`]: response('export {}', {
        headers: { 'content-type': 'text/javascript' },
      }),
    })

    await expect(verifyDeployment(baseUrl, fetchImpl)).resolves.toMatchObject({
      assets: ['/assets/styles-good.css', '/assets/chunk-good.js'],
    })
  })

  it('rejects an inline bootstrap backed only by external scripts and module preloads', async () => {
    const externalAssets = response(
      '<link rel="stylesheet" href="/assets/styles-good.css"><link rel="modulepreload" href="https://cdn.example/chunk.js"><script type="module">import \'https://cdn.example/app.js\'</script>',
      { headers: { 'content-type': 'text/html' } },
    )
    const fetchImpl = deploymentFetch({
      [`${baseUrl}/login?redirect=&error=`]: externalAssets,
    })

    await expect(verifyDeployment(baseUrl, fetchImpl)).rejects.toThrow(/local JavaScript/i)
  })

  it('validates the content type of local module preloads', async () => {
    const invalidPreload = response(
      '<link rel="stylesheet" href="/assets/styles-good.css"><link rel="modulepreload" href="/assets/chunk-good.js"><script type="module">import \'/assets/chunk-good.js\'</script>',
      { headers: { 'content-type': 'text/html' } },
    )
    const fetchImpl = deploymentFetch({
      [`${baseUrl}/login?redirect=&error=`]: invalidPreload,
      [`${baseUrl}/assets/chunk-good.js`]: response('.not-javascript{}', {
        headers: { 'content-type': 'text/css' },
      }),
    })

    await expect(verifyDeployment(baseUrl, fetchImpl)).rejects.toThrow(/JavaScript/i)
  })

  it('rejects a whitespace-only inline module as the only bootstrap', async () => {
    const whitespaceModule = response(
      '<link rel="stylesheet" href="/assets/styles-good.css"><script type="module">\n  \t </script>',
      { headers: { 'content-type': 'text/html' } },
    )
    const fetchImpl = deploymentFetch({
      [`${baseUrl}/login?redirect=&error=`]: whitespaceModule,
    })

    await expect(verifyDeployment(baseUrl, fetchImpl)).rejects.toThrow(/JavaScript/i)
  })

  it('rejects a classic inline script as the only bootstrap', async () => {
    const classicInline = response(
      '<link rel="stylesheet" href="/assets/styles-good.css"><script>console.log(\'bootstrap\')</script>',
      { headers: { 'content-type': 'text/html' } },
    )
    const fetchImpl = deploymentFetch({
      [`${baseUrl}/login?redirect=&error=`]: classicInline,
    })

    await expect(verifyDeployment(baseUrl, fetchImpl)).rejects.toThrow(/JavaScript/i)
  })

  it('checks required selectors across the combined local stylesheets', async () => {
    const splitStyles = response(
      '<link rel="stylesheet" href="/assets/vendor.css"><link rel="stylesheet" href="/assets/styles-good.css"><script src="/assets/app-good.js"></script>',
      { headers: { 'content-type': 'text/html' } },
    )
    const fetchImpl = deploymentFetch({
      [`${baseUrl}/login?redirect=&error=`]: splitStyles,
      [`${baseUrl}/assets/vendor.css`]: response(':root{color-scheme:light}', { headers: { 'content-type': 'text/css' } }),
    })

    await expect(verifyDeployment(baseUrl, fetchImpl)).resolves.toMatchObject({
      assets: ['/assets/vendor.css', '/assets/styles-good.css', '/assets/app-good.js'],
    })
  })

  it('aborts a stalled deployment request', async () => {
    const stalledFetch = vi.fn((_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
    }))

    await expect(verifyDeployment(baseUrl, stalledFetch, { timeoutMs: 5 })).rejects.toThrow(/timed out/i)
  })
})
