import { mkdir, readdir, rename, rmdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

function isMarkdownFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.md')
}

type VaultFilesystemScan = {
  markdownFiles: string[]
  folderPaths: string[]
}

function toVaultRelativePath(rootPath: string, absolutePath: string): string {
  return path.relative(rootPath, absolutePath).split(path.sep).join('/')
}

async function walkVaultFilesystem(
  rootPath: string,
  currentPath: string,
  collectedMarkdownFiles: string[],
  collectedFolderPaths: string[],
) {
  const entries = await readdir(currentPath, { withFileTypes: true })

  for (const entry of entries) {
    const absoluteEntryPath = path.join(currentPath, entry.name)

    if (entry.isSymbolicLink()) {
      continue
    }

    if (entry.isDirectory()) {
      const relativePath = toVaultRelativePath(rootPath, absoluteEntryPath)
      if (relativePath) {
        collectedFolderPaths.push(relativePath)
      }

      await walkVaultFilesystem(rootPath, absoluteEntryPath, collectedMarkdownFiles, collectedFolderPaths)
      continue
    }

    if (!entry.isFile() || !isMarkdownFile(entry.name)) {
      continue
    }

    collectedMarkdownFiles.push(toVaultRelativePath(rootPath, absoluteEntryPath))
  }
}

export async function scanVaultFilesystem(rootPath: string): Promise<VaultFilesystemScan> {
  const markdownFiles: string[] = []
  const folderPaths: string[] = []

  await walkVaultFilesystem(rootPath, rootPath, markdownFiles, folderPaths)

  return {
    markdownFiles: markdownFiles.sort((left, right) => left.localeCompare(right)),
    folderPaths: folderPaths.sort((left, right) => left.localeCompare(right)),
  }
}

export async function listMarkdownFiles(rootPath: string): Promise<string[]> {
  const scan = await scanVaultFilesystem(rootPath)
  return scan.markdownFiles
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

export class VaultFolderNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultFolderNotFoundError'
  }
}

export class VaultFolderNotEmptyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultFolderNotEmptyError'
  }
}

export class VaultPathConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultPathConflictError'
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

export async function moveVaultMarkdownFile(rootPath: string, fromRelPath: string, toRelPath: string): Promise<void> {
  const fromAbsolutePath = toAbsoluteVaultPath(rootPath, fromRelPath)
  const toAbsolutePath = toAbsoluteVaultPath(rootPath, toRelPath)

  try {
    const existing = await stat(fromAbsolutePath)
    if (!existing.isFile()) {
      throw new VaultFileNotFoundError(`File not found: ${fromRelPath}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new VaultFileNotFoundError(`File not found: ${fromRelPath}`)
    }

    if (error instanceof VaultFileNotFoundError) {
      throw error
    }

    throw error
  }

  try {
    await stat(toAbsolutePath)
    throw new VaultPathConflictError(`Path already exists: ${toRelPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof VaultPathConflictError) {
        throw error
      }

      throw error
    }
  }

  await mkdir(path.dirname(toAbsolutePath), { recursive: true })
  await rename(fromAbsolutePath, toAbsolutePath)
}

export async function deleteVaultMarkdownFile(rootPath: string, relPath: string): Promise<void> {
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

  await rm(absolutePath)
}

export async function deleteVaultFolder(rootPath: string, relPath: string): Promise<void> {
  const absolutePath = toAbsoluteVaultPath(rootPath, relPath)

  try {
    const existing = await stat(absolutePath)
    if (!existing.isDirectory()) {
      throw new VaultFolderNotFoundError(`Folder not found: ${relPath}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new VaultFolderNotFoundError(`Folder not found: ${relPath}`)
    }

    if (error instanceof VaultFolderNotFoundError) {
      throw error
    }

    throw error
  }

  const entries = await readdir(absolutePath)
  if (entries.length > 0) {
    throw new VaultFolderNotEmptyError(`Folder not empty: ${relPath}`)
  }

  await rmdir(absolutePath)
}
