import { copyFile, lstat, mkdir, readdir, rename, rmdir, rm, realpath, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
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

export class VaultPathSafetyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultPathSafetyError'
  }
}

function isInsideRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

async function resolveSafeParentPath(rootPath: string, relPath: string, createMissingParents: boolean): Promise<string> {
  const absoluteRoot = path.resolve(rootPath)
  const absoluteTarget = path.resolve(absoluteRoot, relPath)

  if (!isInsideRoot(absoluteRoot, absoluteTarget)) {
    throw new VaultPathSafetyError(`Path escapes vault root: ${relPath}`)
  }

  const segments = path.relative(absoluteRoot, absoluteTarget).split(path.sep).filter(Boolean)
  const targetName = segments.pop()
  if (!targetName) {
    throw new VaultPathSafetyError(`Path resolves to the vault root: ${relPath}`)
  }

  let currentPath = await realpath(absoluteRoot)

  for (const segment of segments) {
    const nextPath = path.join(currentPath, segment)

    try {
      const currentStat = await lstat(nextPath)
      if (currentStat.isSymbolicLink()) {
        throw new VaultPathSafetyError(`Symbolic links are not allowed in vault paths: ${relPath}`)
      }
      if (!currentStat.isDirectory()) {
        throw new VaultPathSafetyError(`Vault parent is not a directory: ${relPath}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && createMissingParents) {
        await mkdir(nextPath)
        const createdStat = await lstat(nextPath)
        if (createdStat.isSymbolicLink() || !createdStat.isDirectory()) {
          throw new VaultPathSafetyError(`Unsafe vault parent: ${relPath}`)
        }
      } else {
        throw error
      }
    }

    currentPath = nextPath
  }

  return path.join(currentPath, targetName)
}

async function resolveExistingParentPath(rootPath: string, relPath: string, missingError: Error): Promise<string> {
  try {
    return await resolveSafeParentPath(rootPath, relPath, false)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw missingError
    }
    throw error
  }
}

async function assertSafeTarget(absolutePath: string, relPath: string, expectedType?: 'file' | 'directory') {
  const currentStat = await lstat(absolutePath)
  if (currentStat.isSymbolicLink() || (expectedType === 'file' && !currentStat.isFile()) || (expectedType === 'directory' && !currentStat.isDirectory())) {
    throw new VaultPathSafetyError(`Unsafe vault path: ${relPath}`)
  }
  return currentStat
}

type VaultFileReplacementOperations = {
  copyFile: typeof copyFile
  rename: typeof rename
  rm: typeof rm
  writeFile: typeof writeFile
}

const defaultVaultFileReplacementOperations: VaultFileReplacementOperations = {
  copyFile,
  rename,
  rm,
  writeFile,
}

export async function replaceVaultFile(
  absolutePath: string,
  rawMarkdown: string,
  operations: VaultFileReplacementOperations = defaultVaultFileReplacementOperations,
): Promise<void> {
  const temporaryPath = path.join(path.dirname(absolutePath), `.${path.basename(absolutePath)}.${randomUUID()}.tmp`)

  try {
    await operations.writeFile(temporaryPath, rawMarkdown, { encoding: 'utf8', flag: 'wx' })

    try {
      await operations.rename(temporaryPath, absolutePath)
    } catch (error) {
      // Windows does not replace an existing file with rename(). Copying over
      // the destination keeps the original in place if the fallback itself
      // fails; the temporary file is cleaned up in finally.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'EPERM') {
        throw error
      }

      await operations.copyFile(temporaryPath, absolutePath)
    }
  } finally {
    await operations.rm(temporaryPath, { force: true }).catch(() => undefined)
  }
}

export async function createVaultFolder(rootPath: string, relPath: string): Promise<boolean> {
  const absolutePath = await resolveSafeParentPath(rootPath, relPath, true)

  try {
    const existing = await assertSafeTarget(absolutePath, relPath)
    if (!existing.isDirectory()) {
      throw new Error('Folder path already exists as a file')
    }

    return false
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  await mkdir(absolutePath)
  return true
}

export async function createVaultMarkdownFile(rootPath: string, relPath: string, rawMarkdown: string): Promise<void> {
  const absolutePath = await resolveSafeParentPath(rootPath, relPath, true)

  try {
    await assertSafeTarget(absolutePath, relPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

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
  const absolutePath = await resolveExistingParentPath(
    rootPath,
    relPath,
    new VaultFileNotFoundError(`File not found: ${relPath}`),
  )

  try {
    const existing = await assertSafeTarget(absolutePath, relPath)
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

  await replaceVaultFile(absolutePath, rawMarkdown)
}

export async function moveVaultMarkdownFile(rootPath: string, fromRelPath: string, toRelPath: string): Promise<void> {
  const fromAbsolutePath = await resolveExistingParentPath(
    rootPath,
    fromRelPath,
    new VaultFileNotFoundError(`File not found: ${fromRelPath}`),
  )
  const toAbsolutePath = await resolveSafeParentPath(rootPath, toRelPath, true)

  try {
    const existing = await assertSafeTarget(fromAbsolutePath, fromRelPath)
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
    await assertSafeTarget(toAbsolutePath, toRelPath)
    throw new VaultPathConflictError(`Path already exists: ${toRelPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof VaultPathConflictError) {
        throw error
      }

      throw error
    }
  }

  await rename(fromAbsolutePath, toAbsolutePath)
}

export async function deleteVaultMarkdownFile(rootPath: string, relPath: string): Promise<void> {
  const absolutePath = await resolveExistingParentPath(
    rootPath,
    relPath,
    new VaultFileNotFoundError(`File not found: ${relPath}`),
  )

  try {
    const existing = await assertSafeTarget(absolutePath, relPath)
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
  const absolutePath = await resolveExistingParentPath(
    rootPath,
    relPath,
    new VaultFolderNotFoundError(`Folder not found: ${relPath}`),
  )

  try {
    const existing = await assertSafeTarget(absolutePath, relPath)
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
