import path from 'node:path'
import matter from 'gray-matter'
import { normalizeVaultPath } from '../paths'
import { normalizePathTitleSegment } from './title'

export type VaultNoteLink = {
  raw: string
  kind: 'wiki' | 'markdown'
  text: string | null
  target: string
  resolved: boolean
  targetRelPath: string | null
  targetSlug: string | null
}

export type ParsedVaultNote = {
  id: string
  relPath: string
  slug: string
  title: string
  summary: string | null
  tags: string[]
  authors: string[]
  source: string | null
  references: string[]
  createdAt: string | null
  updatedAt: string | null
  frontmatter: Record<string, unknown>
  body: string
  rawMarkdown: string
  outgoingLinks: VaultNoteLink[]
  warnings: string[]
}

export type ParseNoteInput = {
  relPath: string
  rawMarkdown: string
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function fallbackTitleFromPath(relPath: string): string {
  return path.basename(relPath, path.extname(relPath))
}

function extractHeadingTitle(body: string): string | null {
  const match = body.match(/^#\s+(.+)$/m)
  return normalizeText(match?.[1] ?? null)
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'note'
}

function normalizeSlug(value: unknown, fallback: string): string {
  const raw = normalizeText(value) ?? fallback
  return slugify(raw)
}

function normalizeTags(value: unknown): string[] {
  const rawEntries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  const seen = new Set<string>()

  for (const rawEntry of rawEntries) {
    if (typeof rawEntry !== 'string') {
      continue
    }

    const normalized = rawEntry.trim().toLowerCase()
    if (!normalized) {
      continue
    }

    seen.add(normalized)
  }

  return [...seen].sort((left, right) => left.localeCompare(right))
}

function normalizeStringList(value: unknown): string[] {
  const rawEntries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  const seen = new Set<string>()

  for (const rawEntry of rawEntries) {
    const normalized = normalizeText(rawEntry)
    if (!normalized) {
      continue
    }

    seen.add(normalized)
  }

  return [...seen]
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }

    const parsed = Date.parse(trimmed)
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString()
    }

    return null
  }

  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString()
  }

  return null
}

function createUnresolvedLink(input: {
  raw: string
  kind: 'wiki' | 'markdown'
  target: string
  text?: string | null
}): VaultNoteLink {
  return {
    raw: input.raw,
    kind: input.kind,
    text: input.text ?? null,
    target: input.target,
    resolved: false,
    targetRelPath: null,
    targetSlug: null,
  }
}

function parseLinkTarget(href: string): string {
  const trimmed = href.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim()
  }

  const whitespaceIndex = trimmed.search(/\s/)
  if (whitespaceIndex === -1) {
    return trimmed
  }

  return trimmed.slice(0, whitespaceIndex).trim()
}

function isInternalMarkdownTarget(target: string): boolean {
  if (!target) {
    return false
  }

  if (target.startsWith('#') || target.startsWith('//')) {
    return false
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return false
  }

  const withoutHash = target.split('#')[0] ?? target
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash

  return withoutQuery.toLowerCase().endsWith('.md')
}

function extractWikiLinks(body: string): Array<{ index: number; link: VaultNoteLink }> {
  const matches: Array<{ index: number; link: VaultNoteLink }> = []
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g

  for (const match of body.matchAll(wikiLinkRegex)) {
    const raw = match[0] ?? ''
    const rawTarget = (match[1] ?? '').trim()

    if (!raw || !rawTarget) {
      continue
    }

    const aliasSeparatorIndex = rawTarget.indexOf('|')
    const target = (aliasSeparatorIndex === -1 ? rawTarget : rawTarget.slice(0, aliasSeparatorIndex)).trim()
    const text =
      aliasSeparatorIndex === -1 ? null : normalizeText(rawTarget.slice(aliasSeparatorIndex + 1).trim())

    if (!target) {
      continue
    }

    matches.push({
      index: match.index ?? 0,
      link: createUnresolvedLink({
        raw,
        kind: 'wiki',
        target,
        text,
      }),
    })
  }

  return matches
}

function extractMarkdownLinks(body: string): Array<{ index: number; link: VaultNoteLink }> {
  const matches: Array<{ index: number; link: VaultNoteLink }> = []
  const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)\)/g

  for (const match of body.matchAll(markdownLinkRegex)) {
    const raw = match[0] ?? ''
    const text = normalizeText(match[1] ?? '')
    const parsedTarget = parseLinkTarget(match[2] ?? '')
    const matchIndex = match.index ?? 0

    if (!raw || !parsedTarget || !isInternalMarkdownTarget(parsedTarget)) {
      continue
    }

    if (matchIndex > 0 && body[matchIndex - 1] === '!') {
      continue
    }

    matches.push({
      index: matchIndex,
      link: createUnresolvedLink({
        raw,
        kind: 'markdown',
        target: parsedTarget,
        text,
      }),
    })
  }

  return matches
}

function extractOutgoingLinks(body: string): VaultNoteLink[] {
  const matches = [...extractWikiLinks(body), ...extractMarkdownLinks(body)].sort(
    (left, right) => left.index - right.index,
  )

  return matches.map((match) => match.link)
}

function extractBodyMetadataValue(body: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = body.match(new RegExp(`\\*\\*${escapedLabel}:\\*\\*\\s*(.+)$`, 'mi'))
  return normalizeText(match?.[1] ?? null)
}

function deriveMetadata(input: {
  frontmatter: Record<string, unknown>
  body: string
  relPath: string
}): {
  title: string
  slug: string
  summary: string | null
  tags: string[]
  authors: string[]
  source: string | null
  references: string[]
} {
  const fallbackTitle = fallbackTitleFromPath(input.relPath)
  const headingTitle = extractHeadingTitle(input.body)
  const title =
    normalizeText(input.frontmatter.title) ?? headingTitle ?? normalizePathTitleSegment(fallbackTitle) ?? fallbackTitle

  const summary = normalizeText(input.frontmatter.summary) ?? extractBodyMetadataValue(input.body, 'TL;DR')
  const tags = normalizeTags(input.frontmatter.tags).length
    ? normalizeTags(input.frontmatter.tags)
    : normalizeTags(extractBodyMetadataValue(input.body, 'Tags'))
  const authors = normalizeStringList(input.frontmatter.authors ?? input.frontmatter.author).length
    ? normalizeStringList(input.frontmatter.authors ?? input.frontmatter.author)
    : normalizeStringList(extractBodyMetadataValue(input.body, 'Author'))
  const source = normalizeText(input.frontmatter.source) ?? extractBodyMetadataValue(input.body, 'Source')
  const references = normalizeStringList(input.frontmatter.references).length
    ? normalizeStringList(input.frontmatter.references)
    : normalizeStringList(
        (extractBodyMetadataValue(input.body, 'References') ?? '')
          .replace(/\[\[/g, '')
          .replace(/\]\]/g, ''),
      )

  return {
    title,
    slug: normalizeSlug(input.frontmatter.slug, fallbackTitle),
    summary,
    tags,
    authors,
    source,
    references,
  }
}

export function parseNote(input: ParseNoteInput): ParsedVaultNote {
  const relPath = normalizeVaultPath(input.relPath)
  const warnings: string[] = []

  let frontmatter: Record<string, unknown> = {}
  let body = input.rawMarkdown

  try {
    const parsed = matter(input.rawMarkdown)
    frontmatter = toRecord(parsed.data)
    body = parsed.content
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    warnings.push(`Failed to parse frontmatter for "${relPath}": ${reason}`)
  }

  const metadata = deriveMetadata({
    frontmatter,
    body,
    relPath,
  })

  return {
    id: relPath,
    relPath,
    title: metadata.title,
    slug: metadata.slug,
    summary: metadata.summary,
    tags: metadata.tags,
    authors: metadata.authors,
    source: metadata.source,
    references: metadata.references,
    createdAt: normalizeDate(frontmatter.createdAt),
    updatedAt: normalizeDate(frontmatter.updatedAt),
    frontmatter,
    body,
    rawMarkdown: input.rawMarkdown,
    outgoingLinks: extractOutgoingLinks(body),
    warnings,
  }
}
