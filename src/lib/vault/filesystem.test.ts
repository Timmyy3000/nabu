import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { listMarkdownFiles } from './filesystem'

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

  it('does not follow symlinked directories out of the vault', async () => {
    const rootPath = await createVaultFixture()
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-outside-'))
    tempRoots.push(outsideRoot)
    await writeFile(path.join(outsideRoot, 'secret.md'), '# secret')
    await symlink(outsideRoot, path.join(rootPath, 'linked-outside'))

    const files = await listMarkdownFiles(rootPath)

    expect(files).not.toContain('linked-outside/secret.md')
  })
})
