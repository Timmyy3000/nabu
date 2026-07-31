import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  createVaultFolder,
  createVaultMarkdownFile,
  listMarkdownFiles,
  scanVaultFilesystem,
  updateVaultMarkdownFile,
  VaultFileAlreadyExistsError,
  VaultFileNotFoundError,
  VaultPathSafetyError,
} from './filesystem'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.allSettled(
    tempRoots.map(async (tempRoot) => {
      await import('node:fs/promises').then(({ rm }) => rm(tempRoot, { recursive: true, force: true }))
    }),
  )
  tempRoots.length = 0
})

async function createVaultFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-filesystem-'))
  tempRoots.push(root)

  await mkdir(path.join(root, 'ideas', 'ai'), { recursive: true })
  await mkdir(path.join(root, 'projects', 'nabu'), { recursive: true })
  await mkdir(path.join(root, 'projects', 'empty'), { recursive: true })

  await writeFile(path.join(root, 'ideas', 'ai', 'agent-memory.md'), '# Agent memory')
  await writeFile(path.join(root, 'projects', 'nabu', 'roadmap.md'), '# Roadmap')
  await writeFile(path.join(root, 'README.txt'), 'ignore me')
  await writeFile(path.join(root, 'ideas', 'draft.MD'), '# Uppercase extension')

  return root
}

describe('listMarkdownFiles', () => {
  it('recursively lists markdown files as normalized vault-relative paths', async () => {
    const rootPath = await createVaultFixture()

    const files = await listMarkdownFiles(rootPath)

    expect(files).toEqual([
      'ideas/ai/agent-memory.md',
      'ideas/draft.MD',
      'projects/nabu/roadmap.md',
    ])
  })

  it('ignores non-markdown files', async () => {
    const rootPath = await createVaultFixture()

    const files = await listMarkdownFiles(rootPath)

    expect(files).not.toContain('README.txt')
  })

  it.skipIf(process.platform === 'win32')('does not follow symlinked directories out of the vault', async () => {
    const rootPath = await createVaultFixture()
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-outside-'))
    tempRoots.push(outsideRoot)
    await writeFile(path.join(outsideRoot, 'secret.md'), '# secret')
    await symlink(outsideRoot, path.join(rootPath, 'linked-outside'), process.platform === 'win32' ? 'junction' : 'dir')

    const files = await listMarkdownFiles(rootPath)

    expect(files).not.toContain('linked-outside/secret.md')
  })

  it('scans markdown files and persisted directories in one pass', async () => {
    const rootPath = await createVaultFixture()

    const scanned = await scanVaultFilesystem(rootPath)

    expect(scanned.markdownFiles).toEqual([
      'ideas/ai/agent-memory.md',
      'ideas/draft.MD',
      'projects/nabu/roadmap.md',
    ])
    expect(scanned.folderPaths).toEqual(['ideas', 'ideas/ai', 'projects', 'projects/empty', 'projects/nabu'])
  })
})

describe('vault write primitives', () => {
  it('creates nested folders and reports whether they were created', async () => {
    const rootPath = await createVaultFixture()

    await expect(createVaultFolder(rootPath, 'projects/nabu/specs')).resolves.toBe(true)
    await expect(createVaultFolder(rootPath, 'projects/nabu/specs')).resolves.toBe(false)

    const folderStat = await stat(path.join(rootPath, 'projects', 'nabu', 'specs'))
    expect(folderStat.isDirectory()).toBe(true)
  })

  it('creates markdown files without overwriting existing files', async () => {
    const rootPath = await createVaultFixture()
    const relPath = 'projects/nabu/specs/agent-operability.md'

    await createVaultMarkdownFile(rootPath, relPath, '# Agent Operability')
    await expect(
      createVaultMarkdownFile(rootPath, relPath, '# Agent Operability v2'),
    ).rejects.toBeInstanceOf(VaultFileAlreadyExistsError)

    const content = await readFile(path.join(rootPath, 'projects', 'nabu', 'specs', 'agent-operability.md'), 'utf8')
    expect(content).toBe('# Agent Operability')
  })

  it('updates existing markdown files and rejects missing files', async () => {
    const rootPath = await createVaultFixture()
    const existingRelPath = 'ideas/ai/agent-memory.md'

    await updateVaultMarkdownFile(rootPath, existingRelPath, '# Updated memory')
    await expect(
      updateVaultMarkdownFile(rootPath, 'ideas/ai/missing.md', '# Missing'),
    ).rejects.toBeInstanceOf(VaultFileNotFoundError)

    const content = await readFile(path.join(rootPath, 'ideas', 'ai', 'agent-memory.md'), 'utf8')
    expect(content).toBe('# Updated memory')
  })

  it.skipIf(process.platform === 'win32')('rejects writes through symlinked files and parent directories', async () => {
    const rootPath = await createVaultFixture()
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-outside-'))
    tempRoots.push(outsideRoot)
    const outsideNote = path.join(outsideRoot, 'secret.md')
    await writeFile(outsideNote, '# secret')
    await symlink(outsideNote, path.join(rootPath, 'linked.md'))
    await symlink(outsideRoot, path.join(rootPath, 'linked-folder'))

    await expect(updateVaultMarkdownFile(rootPath, 'linked.md', '# changed')).rejects.toBeInstanceOf(
      VaultPathSafetyError,
    )
    await expect(
      createVaultMarkdownFile(rootPath, 'linked-folder/new.md', '# changed'),
    ).rejects.toBeInstanceOf(VaultPathSafetyError)

    await expect(readFile(outsideNote, 'utf8')).resolves.toBe('# secret')
  })

  it('rejects deleting the vault root', async () => {
    const rootPath = await createVaultFixture()

    await expect(import('./filesystem').then(({ deleteVaultFolder }) => deleteVaultFolder(rootPath, ''))).rejects.toBeInstanceOf(
      VaultPathSafetyError,
    )
  })
})
