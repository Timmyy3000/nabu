import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to determine a free local port'))
        return
      }

      server.close(() => resolve(address.port))
    })
  })
}

async function waitForLogin(baseUrl, child, stderr) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/login`)
      if (response.ok) {
        return response
      }
    } catch {
      // The server may still be starting.
    }

    if (child.exitCode != null) {
      throw new Error(`Production server exited before becoming ready: ${stderr.join('')}`)
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error(`Production server did not become ready: ${stderr.join('')}`)
}

const port = await getFreePort()
const child = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
  },
  stdio: ['ignore', 'ignore', 'pipe'],
})
const stderr = []
child.stderr.on('data', (chunk) => stderr.push(String(chunk)))

try {
  const baseUrl = `http://127.0.0.1:${port}`
  const login = await waitForLogin(baseUrl, child, stderr)
  const html = await login.text()
  const cssHref = html.match(/href="([^"]+\.css[^"]*)"/)?.[1]

  if (!cssHref) {
    throw new Error('Login HTML did not include a compiled stylesheet link')
  }

  const stylesheet = await fetch(new URL(cssHref, baseUrl))
  const contentType = stylesheet.headers.get('content-type') ?? ''
  const css = await stylesheet.text()

  if (!stylesheet.ok || !contentType.includes('text/css')) {
    throw new Error(`Stylesheet request failed: ${stylesheet.status} ${contentType}`)
  }

  for (const selector of ['.app-shell', '.vault-shell']) {
    if (!css.includes(selector)) {
      throw new Error(`Served stylesheet is missing the Nabu selector ${selector}`)
    }
  }

  console.log(`Verified /login and ${cssHref} (${Buffer.byteLength(css)} bytes, ${contentType})`)
} finally {
  child.kill()
}
