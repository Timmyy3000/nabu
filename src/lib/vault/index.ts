import path from 'node:path'
import type { ParsedVaultNote } from './parse-note'
import type { VaultIndex } from './types'

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1
  }

  if (left > right) {
    return 1
  }

  return 0
}

function collectFolders(relPath: string): string[] {
  const folder = path.posix.dirname(relPath)
  if (folder === '.') {
    return []
  }

  const segments = folder.split('/')
  const folders: string[] = []

  for (let index = 0; index < segments.length; index += 1) {
    folders.push(segments.slice(0, index + 1).join('/'))
  }

  return folders
}

export function buildVaultIndex(inputNotes: ParsedVaultNote[]): VaultIndex {
  const notes = [...inputNotes].sort((left, right) => compareStrings(left.relPath, right.relPath))

  const byRelPath = new Map<string, ParsedVaultNote>()
  const bySlug = new Map<string, ParsedVaultNote>()
  const slugEntries = new Map<string, string[]>()
  const folderSet = new Set<string>()
  const tags = new Map<string, string[]>()
  const warnings: string[] = []

  for (const note of notes) {
    byRelPath.set(note.relPath, note)

    if (!bySlug.has(note.slug)) {
      bySlug.set(note.slug, note)
    }

    const existingSlugEntries = slugEntries.get(note.slug)
    if (existingSlugEntries) {
      existingSlugEntries.push(note.relPath)
    } else {
      slugEntries.set(note.slug, [note.relPath])
    }

    for (const folder of collectFolders(note.relPath)) {
      folderSet.add(folder)
    }

    for (const tag of note.tags) {
      const tagEntries = tags.get(tag)
      if (tagEntries) {
        tagEntries.push(note.relPath)
      } else {
        tags.set(tag, [note.relPath])
      }
    }

    warnings.push(...note.warnings)
  }

  const slugCollisions = new Map<string, string[]>()

  for (const [slug, relPaths] of slugEntries) {
    if (relPaths.length < 2) {
      continue
    }

    slugCollisions.set(slug, relPaths)
    warnings.push(`Duplicate slug "${slug}" found in: ${relPaths.join(', ')}`)
  }

  const folders = [...folderSet].sort(compareStrings)

  return {
    notes,
    byRelPath,
    bySlug,
    slugCollisions,
    folders,
    tags,
    warnings,
    stats: {
      noteCount: notes.length,
      folderCount: folders.length,
      tagCount: tags.size,
      collisionCount: slugCollisions.size,
      warningCount: warnings.length,
    },
  }
}
