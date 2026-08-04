import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const entrypoint = path.resolve('src/mcp/stdio.ts')
const tsxEntrypoint = path.resolve('node_modules/tsx/dist/cli.mjs')

function startProcess(environment: NodeJS.ProcessEnv) {
  return spawn(process.execPath, [tsxEntrypoint, entrypoint], {
    cwd: process.cwd(),
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

describe('MCP stdio entrypoint', () => {
  it('fails closed when no mode is configured', async () => {
    const environment = { ...process.env }
    delete environment.NABU_MCP_MODE
    delete environment.KNOWLEDGE_PATH
    delete environment.NABU_URL

    const child = startProcess(environment)
    const stderrPromise = once(child.stderr!, 'data')
    const [exitCode] = await once(child, 'exit')
    const [stderr] = await stderrPromise

    expect(exitCode).toBe(1)
    expect(String(stderr)).toContain('Configure exactly one of KNOWLEDGE_PATH or NABU_URL')
  })

  it('starts a direct-vault stdio server after preparing the vault', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nabu-mcp-stdio-'))
    await mkdir(root, { recursive: true })

    const child = startProcess({
      ...process.env,
      NABU_MCP_MODE: 'direct',
      KNOWLEDGE_PATH: root,
      NABU_URL: undefined,
    })

    try {
      const [stderr] = await once(child.stderr!, 'data')
      expect(String(stderr)).toContain('Nabu MCP server starting in direct mode')
    } finally {
      child.kill()
      await once(child, 'exit').catch(() => undefined)
      await rm(root, { recursive: true, force: true })
    }
  })

  it('starts remote stdio MCP with the Nabu password and URL only', async () => {
    const child = startProcess({
      ...process.env,
      NABU_MCP_MODE: 'remote',
      NABU_URL: 'http://localhost:3000',
      NABU_PASSWORD: 'test-password',
      KNOWLEDGE_PATH: undefined,
    })

    try {
      const [stderr] = await once(child.stderr!, 'data')
      expect(String(stderr)).toContain('Nabu MCP server starting in remote mode')
    } finally {
      child.kill()
      await once(child, 'exit').catch(() => undefined)
    }
  })
})
