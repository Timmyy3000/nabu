import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getVaultConfig } from './config'
import { listMarkdownFiles } from './filesystem'
import { buildVaultIndex } from './index'
import { parseNote, type ParsedVaultNote } from './parse-note'
import type { VaultIndex, VaultIndexStats } from './types'

type LoadedVaultIndex = VaultIndex & {
  builtAt: string
  sourceRoot: string
}

type VaultIndexSummaryNote = {
  id: string
  relPath: string
  slug: string
  title: string
  summary: string | null
  tags: string[]
  createdAt: string | null
  updatedAt: string | null
}

type VaultNotePayload = {
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
}

type VaultSlugLookup = {
  builtAt: string
  collisions: string[]
  note: VaultNotePayload
}

let cachedIndex: LoadedVaultIndex | null = null
let inFlightBuild: Promise<LoadedVaultIndex> | null = null

function normalizeSlugInput(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toLoadedVaultIndex(index: VaultIndex, sourceRoot: string): LoadedVaultIndex {
  return {
    ...index,
    builtAt: new Date().toISOString(),
    sourceRoot,
  }
}

async function buildIndexFromDisk(): Promise<LoadedVaultIndex> {
  const { rootPath } = await getVaultConfig()
  const relPaths = await listMarkdownFiles(rootPath)

  const notes = await Promise.all(
    relPaths.map(async (relPath) => {
      const absPath = path.join(rootPath, relPath)
      const rawMarkdown = await readFile(absPath, 'utf8')
      return parseNote({ relPath, rawMarkdown })
    }),
  )

  return toLoadedVaultIndex(buildVaultIndex(notes), rootPath)
}

async function loadVaultIndex(forceRebuild: boolean): Promise<LoadedVaultIndex> {
  if (!forceRebuild && cachedIndex) {
    return cachedIndex
  }

  if (inFlightBuild) {
    return inFlightBuild
  }

  inFlightBuild = buildIndexFromDisk().then((nextIndex) => {
    cachedIndex = nextIndex
    return nextIndex
  })

  try {
    return await inFlightBuild
  } finally {
    inFlightBuild = null
  }
}

function toSummaryNote(note: ParsedVaultNote): VaultIndexSummaryNote {
  return {
    id: note.id,
    relPath: note.relPath,
    slug: note.slug,
    title: note.title,
    summary: note.summary,
    tags: note.tags,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
}

function toVaultNotePayload(note: ParsedVaultNote): VaultNotePayload {
  return {
    id: note.id,
    relPath: note.relPath,
    slug: note.slug,
    title: note.title,
    summary: note.summary,
    tags: note.tags,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    frontmatter: note.frontmatter,
    body: note.body,
  }
}

export async function getVaultIndex(): Promise<LoadedVaultIndex> {
  return loadVaultIndex(false)
}

export async function rebuildVaultIndex(): Promise<LoadedVaultIndex> {
  return loadVaultIndex(true)
}

export async function getNoteBySlug(slug: string): Promise<VaultSlugLookup | null> {
  const normalizedSlug = normalizeSlugInput(slug)

  if (!normalizedSlug) {
    return null
  }

  const index = await getVaultIndex()
  const note = index.bySlug.get(normalizedSlug)

  if (!note) {
    return null
  }

  return {
    builtAt: index.builtAt,
    collisions: index.slugCollisions.get(normalizedSlug) ?? [],
    note: toVaultNotePayload(note),
  }
}

export async function getVaultIndexResponse(): Promise<Response> {
  const index = await getVaultIndex()

  return Response.json({
    builtAt: index.builtAt,
    stats: index.stats,
    warnings: index.warnings,
    folders: index.folders,
    notes: index.notes.map(toSummaryNote),
  })
}

export async function getVaultIndexStatsResponse(): Promise<Response> {
  const index = await getVaultIndex()

  return Response.json({
    builtAt: index.builtAt,
    stats: index.stats,
    warnings: index.warnings,
  })
}

export async function getVaultNoteBySlugResponse(slug: string): Promise<Response> {
  const found = await getNoteBySlug(slug)

  if (!found) {
    return Response.json(
      {
        error: 'Note not found',
        slug: normalizeSlugInput(slug),
      },
      { status: 404 },
    )
  }

  return Response.json(found)
}

export function __resetVaultServiceForTests() {
  cachedIndex = null
  inFlightBuild = null
}

export type { LoadedVaultIndex, VaultIndexStats, VaultIndexSummaryNote, VaultNotePayload, VaultSlugLookup }
