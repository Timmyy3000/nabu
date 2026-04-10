import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeVaultPath } from '../paths'
import { getVaultConfig } from './config'
import { listMarkdownFiles } from './filesystem'
import { buildVaultIndex } from './index'
import { parseNote, type ParsedVaultNote } from './parse-note'
import {
  normalizeSearchLimit,
  normalizeSearchOffset,
  normalizeSearchQuery,
  searchVaultIndex,
  type VaultSearchResponse,
} from './search'
import type { VaultFolderListItem, VaultFolderTreeNode, VaultIndex, VaultIndexStats } from './types'

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

type VaultPathLookup = {
  builtAt: string
  note: VaultNotePayload
}

type VaultFolderListing = {
  path: string
  name: string
  folders: VaultFolderListItem[]
  notes: VaultIndexSummaryNote[]
}

type VaultBrowseData = {
  tree: VaultFolderTreeNode
  folder: VaultFolderListing
  selectedNoteSlug: string | null
  note: VaultNotePayload | null
}

type VaultSearchInput = {
  query: string
  path?: string | null
  limit?: number | null
  offset?: number | null
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

function normalizeFolderPathInput(folderPath: string | null | undefined): string {
  if (folderPath == null) {
    return ''
  }

  const trimmed = folderPath.trim()
  if (!trimmed) {
    return ''
  }

  return normalizeVaultPath(trimmed)
}

function normalizeNotePathInput(notePath: string | null | undefined): string {
  if (notePath == null) {
    throw new Error('Note path is required')
  }

  const trimmed = notePath.trim()
  if (!trimmed) {
    throw new Error('Note path is required')
  }

  return normalizeVaultPath(trimmed)
}

function createFolderName(folderPath: string): string {
  if (!folderPath) {
    return ''
  }

  const parts = folderPath.split('/')
  return parts[parts.length - 1] ?? folderPath
}

function getParentFolderPath(relPath: string): string {
  const parent = path.posix.dirname(relPath)
  return parent === '.' ? '' : parent
}

function isNoteInFolder(relPath: string, folderPath: string): boolean {
  return getParentFolderPath(relPath) === folderPath
}

function createFolderMaps(index: LoadedVaultIndex): {
  folderChildren: Map<string, string[]>
  folderNotes: Map<string, ParsedVaultNote[]>
} {
  const folderChildren = new Map<string, string[]>()
  const folderNotes = new Map<string, ParsedVaultNote[]>()

  folderChildren.set('', [])
  folderNotes.set('', [])

  for (const folderPath of index.folders) {
    folderChildren.set(folderPath, [])
    folderNotes.set(folderPath, [])
  }

  for (const folderPath of index.folders) {
    const parentPath = path.posix.dirname(folderPath)
    const parentKey = parentPath === '.' ? '' : parentPath
    const siblings = folderChildren.get(parentKey)
    if (siblings) {
      siblings.push(folderPath)
    } else {
      folderChildren.set(parentKey, [folderPath])
    }
  }

  for (const note of index.notes) {
    const parentPath = path.posix.dirname(note.relPath)
    const parentKey = parentPath === '.' ? '' : parentPath
    const notes = folderNotes.get(parentKey)
    if (notes) {
      notes.push(note)
    } else {
      folderNotes.set(parentKey, [note])
    }
  }

  return { folderChildren, folderNotes }
}

function buildFolderTreeNode(
  folderPath: string,
  folderChildren: Map<string, string[]>,
  folderNotes: Map<string, ParsedVaultNote[]>,
): VaultFolderTreeNode {
  const children = (folderChildren.get(folderPath) ?? []).map((childPath) =>
    buildFolderTreeNode(childPath, folderChildren, folderNotes),
  )
  const directNoteCount = folderNotes.get(folderPath)?.length ?? 0
  const nestedNoteCount = children.reduce((total, child) => total + child.noteCount, 0)

  return {
    path: folderPath,
    name: createFolderName(folderPath),
    directNoteCount,
    noteCount: directNoteCount + nestedNoteCount,
    children,
  }
}

function buildFolderListing(
  folderPath: string,
  folderChildren: Map<string, string[]>,
  folderNotes: Map<string, ParsedVaultNote[]>,
): VaultFolderListing {
  const folders = (folderChildren.get(folderPath) ?? []).map((childPath) => {
    const childTreeNode = buildFolderTreeNode(childPath, folderChildren, folderNotes)
    return {
      path: childTreeNode.path,
      name: childTreeNode.name,
      directNoteCount: childTreeNode.directNoteCount,
      noteCount: childTreeNode.noteCount,
    }
  })

  return {
    path: folderPath,
    name: createFolderName(folderPath),
    folders,
    notes: (folderNotes.get(folderPath) ?? []).map(toSummaryNote),
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

export async function getNoteByPath(relPath: string): Promise<VaultPathLookup | null> {
  const normalizedPath = normalizeVaultPath(relPath)
  const index = await getVaultIndex()
  const note = index.byRelPath.get(normalizedPath)

  if (!note) {
    return null
  }

  return {
    builtAt: index.builtAt,
    note: toVaultNotePayload(note),
  }
}

export async function getVaultTree(): Promise<VaultFolderTreeNode> {
  const index = await getVaultIndex()
  const { folderChildren, folderNotes } = createFolderMaps(index)
  return buildFolderTreeNode('', folderChildren, folderNotes)
}

export async function getFolderListing(folderPathInput: string): Promise<VaultFolderListing | null> {
  const folderPath = normalizeFolderPathInput(folderPathInput)
  const index = await getVaultIndex()

  if (folderPath && !index.folders.includes(folderPath)) {
    return null
  }

  const { folderChildren, folderNotes } = createFolderMaps(index)
  return buildFolderListing(folderPath, folderChildren, folderNotes)
}

export async function getVaultBrowseData(input: {
  folderPath: string | null | undefined
  noteSlug: string | null | undefined
}): Promise<VaultBrowseData> {
  const tree = await getVaultTree()

  let folderListing: VaultFolderListing | null = null

  try {
    folderListing = await getFolderListing(input.folderPath ?? '')
  } catch {
    folderListing = null
  }

  if (!folderListing) {
    const rootListing = await getFolderListing('')
    if (!rootListing) {
      throw new Error('Vault root listing unavailable')
    }

    folderListing = rootListing
  }

  const requestedSlug = normalizeSlugInput(input.noteSlug ?? '')
  let selectedNoteSlug: string | null = null
  let selectedNote: VaultNotePayload | null = null

  if (requestedSlug) {
    const requestedNote = await getNoteBySlug(requestedSlug)
    if (requestedNote && isNoteInFolder(requestedNote.note.relPath, folderListing.path)) {
      selectedNoteSlug = requestedSlug
      selectedNote = requestedNote.note
    }
  }

  if (!selectedNote) {
    const fallback = folderListing.notes[0]
    if (fallback) {
      const fallbackNote = await getNoteBySlug(fallback.slug)
      selectedNoteSlug = fallback.slug
      selectedNote = fallbackNote?.note ?? null
    }
  }

  return {
    tree,
    folder: folderListing,
    selectedNoteSlug,
    note: selectedNote,
  }
}

function normalizeSearchPath(pathInput: string | null | undefined): string {
  if (pathInput == null) {
    return ''
  }

  const trimmed = pathInput.trim()
  if (!trimmed) {
    return ''
  }

  return normalizeVaultPath(trimmed)
}

export async function searchVaultNotes(input: VaultSearchInput): Promise<VaultSearchResponse> {
  const queryData = normalizeSearchQuery(input.query)

  if (!queryData.normalizedQuery) {
    throw new Error('Search query is required')
  }

  const normalizedPath = normalizeSearchPath(input.path)
  const limit = normalizeSearchLimit(input.limit)
  const offset = normalizeSearchOffset(input.offset)
  const index = await getVaultIndex()

  return searchVaultIndex({
    notes: index.notes,
    query: queryData.query,
    path: normalizedPath,
    limit,
    offset,
  })
}

export async function getVaultSearchResponse(input: {
  query: string | null | undefined
  path: string | null | undefined
  limit: string | null | undefined
  offset: string | null | undefined
}): Promise<Response> {
  const rawQuery = input.query ?? ''
  const normalizedQuery = normalizeSearchQuery(rawQuery).normalizedQuery

  if (!normalizedQuery) {
    return Response.json(
      {
        error: 'Search query is required',
      },
      { status: 400 },
    )
  }

  let normalizedPath = ''
  try {
    normalizedPath = normalizeSearchPath(input.path)
  } catch {
    return Response.json(
      {
        error: 'Invalid folder path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }

  const parsedLimit = Number.parseInt(input.limit ?? '', 10)
  const parsedOffset = Number.parseInt(input.offset ?? '', 10)

  const result = await searchVaultNotes({
    query: rawQuery,
    path: normalizedPath,
    limit: Number.isNaN(parsedLimit) ? null : parsedLimit,
    offset: Number.isNaN(parsedOffset) ? null : parsedOffset,
  })
  const index = await getVaultIndex()

  return Response.json({
    builtAt: index.builtAt,
    ...result,
  })
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

export async function getVaultTreeResponse(): Promise<Response> {
  const index = await getVaultIndex()
  const { folderChildren, folderNotes } = createFolderMaps(index)

  return Response.json({
    builtAt: index.builtAt,
    tree: buildFolderTreeNode('', folderChildren, folderNotes),
  })
}

export async function getVaultFolderListingResponse(folderPath: string | null | undefined): Promise<Response> {
  let normalizedPath: string

  try {
    normalizedPath = normalizeFolderPathInput(folderPath)
  } catch {
    return Response.json(
      {
        error: 'Invalid folder path',
        folder: folderPath ?? '',
      },
      { status: 400 },
    )
  }

  const index = await getVaultIndex()

  if (normalizedPath && !index.folders.includes(normalizedPath)) {
    return Response.json(
      {
        error: 'Folder not found',
        folder: normalizedPath,
      },
      { status: 404 },
    )
  }

  const { folderChildren, folderNotes } = createFolderMaps(index)

  return Response.json({
    builtAt: index.builtAt,
    folder: buildFolderListing(normalizedPath, folderChildren, folderNotes),
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

export async function getVaultNoteByPathResponse(pathInput: string | null | undefined): Promise<Response> {
  let normalizedPath: string

  try {
    normalizedPath = normalizeNotePathInput(pathInput)
  } catch {
    return Response.json(
      {
        error: 'Invalid note path',
        path: pathInput ?? '',
      },
      { status: 400 },
    )
  }

  const found = await getNoteByPath(normalizedPath)

  if (!found) {
    return Response.json(
      {
        error: 'Note not found',
        path: normalizedPath,
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

export type {
  LoadedVaultIndex,
  VaultFolderListing,
  VaultBrowseData,
  VaultIndexStats,
  VaultIndexSummaryNote,
  VaultNotePayload,
  VaultPathLookup,
  VaultSearchResponse,
  VaultSlugLookup,
}
