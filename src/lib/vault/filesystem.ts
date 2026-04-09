import { readdir } from 'node:fs/promises'
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
