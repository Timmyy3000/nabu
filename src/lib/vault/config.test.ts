import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getVaultConfig } from './config'

const ORIGINAL_CWD = process.cwd()
const ORIGINAL_KNOWLEDGE_PATH = process.env.KNOWLEDGE_PATH

afterEach(() => {
  process.env.KNOWLEDGE_PATH = ORIGINAL_KNOWLEDGE_PATH
  process.chdir(ORIGINAL_CWD)
})

describe('getVaultConfig', () => {
  it('throws when KNOWLEDGE_PATH is missing', async () => {
    delete process.env.KNOWLEDGE_PATH

    await expect(getVaultConfig()).rejects.toThrow('KNOWLEDGE_PATH is required.')
  })

  it('resolves a relative KNOWLEDGE_PATH from cwd', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-config-'))
    const vaultDir = path.join(tempDir, 'vault')

    await mkdir(vaultDir)
    process.chdir(tempDir)
    process.env.KNOWLEDGE_PATH = './vault'

    const config = await getVaultConfig()

    expect(config.rootPath).toBe(path.resolve(tempDir, 'vault'))
  })

  it('accepts an absolute KNOWLEDGE_PATH', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-config-'))
    process.env.KNOWLEDGE_PATH = tempDir

    const config = await getVaultConfig()

    expect(config.rootPath).toBe(tempDir)
  })

  it('throws when KNOWLEDGE_PATH points to a file', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-config-'))
    const filePath = path.join(tempDir, 'note.md')
    await writeFile(filePath, '# hello')
    process.env.KNOWLEDGE_PATH = filePath

    await expect(getVaultConfig()).rejects.toThrow('KNOWLEDGE_PATH must point to a directory.')
  })
})
