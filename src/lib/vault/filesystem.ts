import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

function isMarkdownFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.md')
}

async function walkMarkdownFiles(rootPath: string, currentPath: string, collected: string[]) {
  const entries = await readdir(currentPath, { withFileTypes: true })

  for (const entry of entries) {
    const absoluteEntryPath = path.join(currentPath, entry.name)

    if (entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      await walkMarkdownFiles(rootPath, absoluteEntryPath, collected)
      continue
    }

    if (!entry.isFile() || !isMarkdownFile(entry.name)) {
      continue
    }

    const relativePath = path.relative(rootPath, absoluteEntryPath).split(path.sep).join('/')
    collected.push(relativePath)
  }
}

export async function listMarkdownFiles(rootPath: string): Promise<string[]> {
  const collected: string[] = []

  await walkMarkdownFiles(rootPath, rootPath, collected)

  return collected.sort((left, right) => left.localeCompare(right))
}

export class VaultFileAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultFileAlreadyExistsError'
  }
}

export class VaultFileNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultFileNotFoundError'
  }
}

function toAbsoluteVaultPath(rootPath: string, relPath: string): string {
  return path.join(rootPath, relPath)
}

export async function createVaultFolder(rootPath: string, relPath: string): Promise<boolean> {
  const absolutePath = toAbsoluteVaultPath(rootPath, relPath)

  try {
    const existing = await stat(absolutePath)
    if (!existing.isDirectory()) {
      throw new Error('Folder path already exists as a file')
    }

    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  await mkdir(absolutePath, { recursive: true })
  return true
}

export async function createVaultMarkdownFile(rootPath: string, relPath: string, rawMarkdown: string): Promise<void> {
  const absolutePath = toAbsoluteVaultPath(rootPath, relPath)
  await mkdir(path.dirname(absolutePath), { recursive: true })

  try {
    await writeFile(absolutePath, rawMarkdown, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new VaultFileAlreadyExistsError(`File already exists: ${relPath}`)
    }

    throw error
  }
}

export async function updateVaultMarkdownFile(rootPath: string, relPath: string, rawMarkdown: string): Promise<void> {
  const absolutePath = toAbsoluteVaultPath(rootPath, relPath)

  try {
    const existing = await stat(absolutePath)
    if (!existing.isFile()) {
      throw new VaultFileNotFoundError(`File not found: ${relPath}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new VaultFileNotFoundError(`File not found: ${relPath}`)
    }

    if (error instanceof VaultFileNotFoundError) {
      throw error
    }

    throw error
  }

  await writeFile(absolutePath, rawMarkdown, { encoding: 'utf8' })
}
