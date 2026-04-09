import path from 'node:path'
import matter from 'gray-matter'
import { normalizeVaultPath } from '../paths'

export type ParsedVaultNote = {
  id: string
  relPath: string
  slug: string
  title: string
  summary: string | null
  tags: string[]
  createdAt: string | null
  updatedAt: string | null
  frontmatter: Record<string, unknown>
  body: string
  rawMarkdown: string
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

  const fallbackTitle = fallbackTitleFromPath(relPath)
  const title = normalizeText(frontmatter.title) ?? fallbackTitle
  const slug = normalizeSlug(frontmatter.slug, fallbackTitle)

  return {
    id: relPath,
    relPath,
    title,
    slug,
    summary: normalizeText(frontmatter.summary),
    tags: normalizeTags(frontmatter.tags),
    createdAt: normalizeDate(frontmatter.createdAt),
    updatedAt: normalizeDate(frontmatter.updatedAt),
    frontmatter,
    body,
    rawMarkdown: input.rawMarkdown,
    warnings,
  }
}
