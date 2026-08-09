import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { __resetSharedSpaceStoreForTests } from '../../lib/shared-spaces/store'
import { Route } from './health'

const originalDataPath = process.env.NABU_DATA_PATH
const originalNodeEnv = process.env.NODE_ENV
const originalPublicUrl = process.env.NABU_PUBLIC_URL
const tempRoots: string[] = []

afterEach(async () => {
  process.env.NABU_DATA_PATH = originalDataPath
  process.env.NODE_ENV = originalNodeEnv
  if (originalPublicUrl === undefined) delete process.env.NABU_PUBLIC_URL
  else process.env.NABU_PUBLIC_URL = originalPublicUrl
  __resetSharedSpaceStoreForTests()
  await Promise.allSettled(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('GET /api/health', () => {
  it('reports ready when shared-space storage opens', async () => {
    const dataPath = await mkdtemp(path.join(os.tmpdir(), 'nabu-health-'))
    tempRoots.push(dataPath)
    process.env.NODE_ENV = 'test'
    process.env.NABU_DATA_PATH = dataPath

    const response = await Route.options.server.handlers.GET({
      request: new Request('http://localhost:3000/api/health'),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok', storage: 'ready' })
  })

  it('reports unavailable when production storage is not configured', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.NABU_DATA_PATH

    const response = await Route.options.server.handlers.GET({
      request: new Request('http://localhost:3000/api/health'),
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ status: 'unready', storage: 'unavailable' })
  })

  it('reports unready when production public URL is absent or invalid', async () => {
    const dataPath = await mkdtemp(path.join(os.tmpdir(), 'nabu-health-public-url-'))
    tempRoots.push(dataPath)
    process.env.NODE_ENV = 'production'
    process.env.NABU_DATA_PATH = dataPath
    process.env.NABU_PUBLIC_URL = 'http://not-loopback.example'

    const response = await Route.options.server.handlers.GET({
      request: new Request('https://evil.example/api/health'),
    })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ status: 'unready', storage: 'unavailable' })
  })
})
