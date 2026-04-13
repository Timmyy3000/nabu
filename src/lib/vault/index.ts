import path from 'node:path'
import { normalizeVaultPath } from '../paths'
import type { ParsedVaultNote, VaultNoteLink } from './parse-note'
import type { VaultBacklink, VaultIndex, VaultResolvedOutgoingLink } from './types'

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

function collectFolderHierarchy(folderPath: string): string[] {
  const segments = folderPath.split('/').filter(Boolean)
  const folders: string[] = []

  for (let index = 0; index < segments.length; index += 1) {
    folders.push(segments.slice(0, index + 1).join('/'))
  }

  return folders
}

function normalizeWikiSlugTarget(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeTitleLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function stripQueryAndFragment(target: string): string {
  const withoutHash = target.split('#')[0] ?? target
  return withoutHash.split('?')[0] ?? withoutHash
}

function toSafeVaultPath(target: string): string | null {
  try {
    return normalizeVaultPath(target)
  } catch {
    return null
  }
}

function resolvePathLikeTarget(input: {
  target: string
  byRelPath: Map<string, ParsedVaultNote>
}): ParsedVaultNote | null {
  const targetWithoutExtras = stripQueryAndFragment(input.target).trim()
  if (!targetWithoutExtras) {
    return null
  }

  const rawTarget = targetWithoutExtras.startsWith('/') ? targetWithoutExtras.slice(1) : targetWithoutExtras
  const normalizedTarget = toSafeVaultPath(rawTarget)
  if (!normalizedTarget) {
    return null
  }

  const directMatch = input.byRelPath.get(normalizedTarget)
  if (directMatch) {
    return directMatch
  }

  if (!normalizedTarget.toLowerCase().endsWith('.md')) {
    return input.byRelPath.get(`${normalizedTarget}.md`) ?? null
  }

  return null
}

function resolveRelativeMarkdownTarget(input: {
  sourceRelPath: string
  target: string
  byRelPath: Map<string, ParsedVaultNote>
}): ParsedVaultNote | null {
  const targetWithoutExtras = stripQueryAndFragment(input.target).trim()
  if (!targetWithoutExtras) {
    return null
  }

  if (targetWithoutExtras.startsWith('/')) {
    return resolvePathLikeTarget({
      target: targetWithoutExtras,
      byRelPath: input.byRelPath,
    })
  }

  const sourceFolder = path.posix.dirname(input.sourceRelPath)
  const resolved = path.posix.normalize(path.posix.join(sourceFolder, targetWithoutExtras))

  if (!resolved || resolved === '.' || resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) {
    return null
  }

  const normalized = toSafeVaultPath(resolved)
  if (!normalized) {
    return null
  }

  const directMatch = input.byRelPath.get(normalized)
  if (directMatch) {
    return directMatch
  }

  if (!normalized.toLowerCase().endsWith('.md')) {
    return input.byRelPath.get(`${normalized}.md`) ?? null
  }

  return null
}

function resolveWikiTarget(input: {
  target: string
  byRelPath: Map<string, ParsedVaultNote>
  bySlug: Map<string, ParsedVaultNote>
  slugEntries: Map<string, string[]>
  titleEntries: Map<string, string[]>
}): ParsedVaultNote | null {
  const target = input.target.trim()
  if (!target) {
    return null
  }

  const isPathLike = target.includes('/') || target.toLowerCase().endsWith('.md')

  if (isPathLike) {
    const pathMatch = resolvePathLikeTarget({ target, byRelPath: input.byRelPath })
    if (pathMatch) {
      return pathMatch
    }
  }

  const normalizedSlug = normalizeWikiSlugTarget(target)
  if (normalizedSlug) {
    const slugMatches = input.slugEntries.get(normalizedSlug) ?? []
    if (slugMatches.length === 1) {
      return input.bySlug.get(normalizedSlug) ?? null
    }
  }

  const normalizedTitle = normalizeTitleLookup(target)
  if (!normalizedTitle) {
    return null
  }

  const titleMatches = input.titleEntries.get(normalizedTitle) ?? []
  if (titleMatches.length !== 1) {
    return null
  }

  return input.byRelPath.get(titleMatches[0] ?? '') ?? null
}

function resolveOutgoingLink(input: {
  sourceRelPath: string
  link: VaultNoteLink
  byRelPath: Map<string, ParsedVaultNote>
  bySlug: Map<string, ParsedVaultNote>
  slugEntries: Map<string, string[]>
  titleEntries: Map<string, string[]>
}): VaultNoteLink {
  const targetNote =
    input.link.kind === 'wiki'
      ? resolveWikiTarget({
          target: input.link.target,
          byRelPath: input.byRelPath,
          bySlug: input.bySlug,
          slugEntries: input.slugEntries,
          titleEntries: input.titleEntries,
        })
      : resolveRelativeMarkdownTarget({
          sourceRelPath: input.sourceRelPath,
          target: input.link.target,
          byRelPath: input.byRelPath,
        })

  if (!targetNote) {
    return {
      ...input.link,
      resolved: false,
      targetRelPath: null,
      targetSlug: null,
    }
  }

  return {
    ...input.link,
    resolved: true,
    targetRelPath: targetNote.relPath,
    targetSlug: targetNote.slug,
  }
}

function compareBacklinks(left: VaultBacklink, right: VaultBacklink): number {
  const sourceOrder = compareStrings(left.sourceRelPath, right.sourceRelPath)
  if (sourceOrder !== 0) {
    return sourceOrder
  }

  const rawOrder = compareStrings(left.raw, right.raw)
  if (rawOrder !== 0) {
    return rawOrder
  }

  return compareStrings(left.sourceSlug, right.sourceSlug)
}

function compareResolvedOutgoing(left: VaultResolvedOutgoingLink, right: VaultResolvedOutgoingLink): number {
  const pathOrder = compareStrings(left.targetRelPath, right.targetRelPath)
  if (pathOrder !== 0) {
    return pathOrder
  }

  const rawOrder = compareStrings(left.raw, right.raw)
  if (rawOrder !== 0) {
    return rawOrder
  }

  return compareStrings(left.target, right.target)
}

export function buildVaultIndex(
  inputNotes: ParsedVaultNote[],
  input?: {
    folderPaths?: string[]
  },
): VaultIndex {
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

  for (const folderPath of input?.folderPaths ?? []) {
    let normalizedFolderPath: string

    try {
      normalizedFolderPath = normalizeVaultPath(folderPath)
    } catch {
      continue
    }

    for (const folder of collectFolderHierarchy(normalizedFolderPath)) {
      folderSet.add(folder)
    }
  }

  const slugCollisions = new Map<string, string[]>()
  const titleEntries = new Map<string, string[]>()
  const backlinksByTargetRelPath = new Map<string, VaultBacklink[]>()
  const resolvedOutgoingBySourceRelPath = new Map<string, VaultResolvedOutgoingLink[]>()
  const unresolvedOutgoingBySourceRelPath = new Map<string, VaultNoteLink[]>()

  for (const [slug, relPaths] of slugEntries) {
    if (relPaths.length < 2) {
      continue
    }

    slugCollisions.set(slug, relPaths)
    warnings.push(`Duplicate slug "${slug}" found in: ${relPaths.join(', ')}`)
  }

  for (const note of notes) {
    const normalizedTitle = normalizeTitleLookup(note.title)
    if (!normalizedTitle) {
      continue
    }

    const entries = titleEntries.get(normalizedTitle)
    if (entries) {
      entries.push(note.relPath)
    } else {
      titleEntries.set(normalizedTitle, [note.relPath])
    }
  }

  for (const note of notes) {
    note.outgoingLinks = note.outgoingLinks.map((link) =>
      resolveOutgoingLink({
        sourceRelPath: note.relPath,
        link,
        byRelPath,
        bySlug,
        slugEntries,
        titleEntries,
      }),
    )

    const resolvedOutgoing = note.outgoingLinks
      .flatMap((link): VaultResolvedOutgoingLink[] => {
        if (!link.resolved || !link.targetRelPath || !link.targetSlug) {
          return []
        }

        return [
          {
            raw: link.raw,
            kind: link.kind,
            text: link.text,
            target: link.target,
            targetRelPath: link.targetRelPath,
            targetSlug: link.targetSlug,
          },
        ]
      })
      .sort(compareResolvedOutgoing)

    const unresolvedOutgoing = note.outgoingLinks
      .filter((link) => !link.resolved)
      .sort((left, right) => compareStrings(left.raw, right.raw))

    resolvedOutgoingBySourceRelPath.set(note.relPath, resolvedOutgoing)
    unresolvedOutgoingBySourceRelPath.set(note.relPath, unresolvedOutgoing)

    for (const link of resolvedOutgoing) {
      const backlinks = backlinksByTargetRelPath.get(link.targetRelPath)
      const backlink: VaultBacklink = {
        sourceRelPath: note.relPath,
        sourceSlug: note.slug,
        sourceTitle: note.title,
        kind: link.kind,
        text: link.text,
        raw: link.raw,
      }

      if (backlinks) {
        backlinks.push(backlink)
      } else {
        backlinksByTargetRelPath.set(link.targetRelPath, [backlink])
      }
    }
  }

  for (const backlinks of backlinksByTargetRelPath.values()) {
    backlinks.sort(compareBacklinks)
  }

  const folders = [...folderSet].sort(compareStrings)

  return {
    notes,
    byRelPath,
    bySlug,
    slugCollisions,
    backlinksByTargetRelPath,
    resolvedOutgoingBySourceRelPath,
    unresolvedOutgoingBySourceRelPath,
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
