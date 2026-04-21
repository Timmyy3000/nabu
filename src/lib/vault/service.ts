import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeVaultPath } from '../paths'
import { getVaultConfig } from './config'
import {
  createVaultFolder as createVaultFolderOnDisk,
  createVaultMarkdownFile,
  deleteVaultFolder as deleteVaultFolderOnDisk,
  deleteVaultMarkdownFile,
  moveVaultMarkdownFile,
  scanVaultFilesystem,
  updateVaultMarkdownFile,
  VaultFileAlreadyExistsError,
  VaultFileNotFoundError,
  VaultFolderNotEmptyError,
  VaultFolderNotFoundError,
  VaultPathConflictError,
} from './filesystem'
import { buildVaultIndex } from './index'
import { parseNote, type ParsedVaultNote, type VaultNoteLink } from './parse-note'
import {
  normalizeSearchLimit,
  normalizeSearchOffset,
  normalizeSearchQuery,
  normalizeSearchTag,
  searchVaultIndex,
  type VaultSearchResponse,
} from './search'
import type {
  VaultBacklink,
  VaultFolderListItem,
  VaultFolderTreeNode,
  VaultIndex,
  VaultIndexStats,
  VaultNoteNeighborhood,
  VaultRelatedReason,
} from './types'

type LoadedVaultIndex = VaultIndex & {
  builtAt: string
  sourceRoot: string
  folderSet: Set<string>
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
  authors: string[]
  source: string | null
  references: string[]
  createdAt: string | null
  updatedAt: string | null
  frontmatter: Record<string, unknown>
  body: string
  outgoingLinks: VaultNoteLink[]
  backlinks: VaultBacklink[]
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
  noteNeighborhood: VaultNoteNeighborhood | null
}

type VaultFolderCreateResult = {
  path: string
  created: boolean
  builtAt: string
}

type VaultFolderDeleteResult = {
  path: string
  deleted: true
  builtAt: string
}

type VaultNoteWriteInput = {
  path: string | null | undefined
  rawMarkdown: string | null | undefined
}

type VaultNoteMoveInput = {
  path: string | null | undefined
  toPath: string | null | undefined
}

type VaultNoteCreateResult = {
  builtAt: string
  created: true
  note: VaultNotePayload
}

type VaultNoteUpdateResult = {
  builtAt: string
  updated: true
  note: VaultNotePayload
}

type VaultNoteDeleteResult = {
  builtAt: string
  deleted: true
  note: {
    relPath: string
  }
}

type VaultNoteMoveResult = {
  builtAt: string
  moved: true
  fromPath: string
  toPath: string
  note: VaultNotePayload
}

type VaultSearchInput = {
  query: string
  path?: string | null
  tag?: string | null
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
    folderSet: new Set(index.folders),
  }
}

async function buildIndexFromDisk(): Promise<LoadedVaultIndex> {
  const { rootPath } = await getVaultConfig()
  const scan = await scanVaultFilesystem(rootPath)

  const notes = await Promise.all(
    scan.markdownFiles.map(async (relPath) => {
      const absPath = path.join(rootPath, relPath)
      const rawMarkdown = await readFile(absPath, 'utf8')
      return parseNote({ relPath, rawMarkdown })
    }),
  )

  return toLoadedVaultIndex(
    buildVaultIndex(notes, {
      folderPaths: scan.folderPaths,
    }),
    rootPath,
  )
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

function toVaultNotePayload(note: ParsedVaultNote, backlinks: VaultBacklink[]): VaultNotePayload {
  return {
    id: note.id,
    relPath: note.relPath,
    slug: note.slug,
    title: note.title,
    summary: note.summary,
    tags: note.tags,
    authors: note.authors,
    source: note.source,
    references: note.references,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    frontmatter: note.frontmatter,
    body: note.body,
    outgoingLinks: note.outgoingLinks,
    backlinks,
  }
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1
  }

  if (left > right) {
    return 1
  }

  return 0
}

function compareReason(left: VaultRelatedReason, right: VaultRelatedReason): number {
  const weight: Record<VaultRelatedReason, number> = {
    outgoing: 1,
    backlink: 2,
    'shared-folder': 3,
  }

  return weight[left] - weight[right]
}

function getParentFolder(relPath: string): string {
  const parent = path.posix.dirname(relPath)
  return parent === '.' ? '' : parent
}

function getNoteBacklinks(index: LoadedVaultIndex, relPath: string): VaultBacklink[] {
  return index.backlinksByTargetRelPath.get(relPath) ?? []
}

function getNoteNeighborhood(index: LoadedVaultIndex, note: ParsedVaultNote): VaultNoteNeighborhood {
  const outgoing = index.resolvedOutgoingBySourceRelPath.get(note.relPath) ?? []
  const backlinks = getNoteBacklinks(index, note.relPath)
  const unresolvedOutgoing = index.unresolvedOutgoingBySourceRelPath.get(note.relPath) ?? []
  const related = new Map<string, { score: number; reasons: Set<VaultRelatedReason> }>()

  const pushReason = (relPath: string, score: number, reason: VaultRelatedReason) => {
    if (relPath === note.relPath) {
      return
    }

    const existing = related.get(relPath)
    if (existing) {
      existing.score += score
      existing.reasons.add(reason)
      return
    }

    related.set(relPath, {
      score,
      reasons: new Set([reason]),
    })
  }

  for (const link of outgoing) {
    pushReason(link.targetRelPath, 2, 'outgoing')
  }

  for (const backlink of backlinks) {
    pushReason(backlink.sourceRelPath, 2, 'backlink')
  }

  const noteFolder = getParentFolder(note.relPath)
  for (const candidate of index.notes) {
    if (candidate.relPath === note.relPath) {
      continue
    }

    if (getParentFolder(candidate.relPath) === noteFolder) {
      pushReason(candidate.relPath, 1, 'shared-folder')
    }
  }

  const relatedNotes = [...related.entries()]
    .flatMap(([relPath, data]) => {
      const candidate = index.byRelPath.get(relPath)
      if (!candidate) {
        return []
      }

      return [
        {
          relPath: candidate.relPath,
          slug: candidate.slug,
          title: candidate.title,
          connectionCount: data.score,
          reasons: [...data.reasons].sort(compareReason),
        },
      ]
    })
    .sort((left, right) => {
      if (left.connectionCount !== right.connectionCount) {
        return right.connectionCount - left.connectionCount
      }

      const titleOrder = compareStrings(left.title, right.title)
      if (titleOrder !== 0) {
        return titleOrder
      }

      return compareStrings(left.relPath, right.relPath)
    })

  return {
    note: {
      relPath: note.relPath,
      slug: note.slug,
      title: note.title,
    },
    outgoing,
    backlinks,
    unresolvedOutgoing,
    relatedNotes,
    stats: {
      outgoingResolvedCount: outgoing.length,
      backlinkCount: backlinks.length,
      unresolvedOutgoingCount: unresolvedOutgoing.length,
    },
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

function normalizeFolderCreatePathInput(folderPath: string | null | undefined): string {
  if (folderPath == null) {
    throw new Error('Folder path is required')
  }

  const trimmed = folderPath.trim()
  if (!trimmed) {
    throw new Error('Folder path is required')
  }

  return normalizeVaultPath(trimmed)
}

function normalizeMarkdownNotePathInput(notePath: string | null | undefined): string {
  const normalized = normalizeNotePathInput(notePath)
  const withMarkdownExtension = normalized.toLowerCase().endsWith('.md') ? normalized : `${normalized}.md`

  if (withMarkdownExtension.endsWith('/.md') || withMarkdownExtension === '.md') {
    throw new Error('Note path must target a markdown file')
  }

  return withMarkdownExtension
}

function normalizeRawMarkdownInput(rawMarkdown: string | null | undefined): string {
  if (typeof rawMarkdown !== 'string') {
    throw new Error('Raw markdown is required')
  }

  if (!rawMarkdown.trim()) {
    throw new Error('Raw markdown is required')
  }

  return rawMarkdown
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
    note: toVaultNotePayload(note, getNoteBacklinks(index, note.relPath)),
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
    note: toVaultNotePayload(note, getNoteBacklinks(index, note.relPath)),
  }
}

export async function getNoteNeighborhoodByPath(relPath: string): Promise<VaultNoteNeighborhood | null> {
  const normalizedPath = normalizeVaultPath(relPath)
  const index = await getVaultIndex()
  const note = index.byRelPath.get(normalizedPath)

  if (!note) {
    return null
  }

  return getNoteNeighborhood(index, note)
}

export async function getVaultTree(): Promise<VaultFolderTreeNode> {
  const index = await getVaultIndex()
  const { folderChildren, folderNotes } = createFolderMaps(index)
  return buildFolderTreeNode('', folderChildren, folderNotes)
}

export async function getFolderListing(folderPathInput: string): Promise<VaultFolderListing | null> {
  const folderPath = normalizeFolderPathInput(folderPathInput)
  const index = await getVaultIndex()

  if (folderPath && !index.folderSet.has(folderPath)) {
    return null
  }

  const { folderChildren, folderNotes } = createFolderMaps(index)
  return buildFolderListing(folderPath, folderChildren, folderNotes)
}

export async function getVaultBrowseData(input: {
  folderPath: string | null | undefined
  noteSlug: string | null | undefined
}): Promise<VaultBrowseData> {
  const index = await getVaultIndex()
  const { folderChildren, folderNotes } = createFolderMaps(index)
  const tree = buildFolderTreeNode('', folderChildren, folderNotes)

  let folderPath = ''
  try {
    folderPath = normalizeFolderPathInput(input.folderPath ?? '')
  } catch {
    folderPath = ''
  }

  if (folderPath && !index.folderSet.has(folderPath)) {
    folderPath = ''
  }

  const folderListing = buildFolderListing(folderPath, folderChildren, folderNotes)

  const requestedSlug = normalizeSlugInput(input.noteSlug ?? '')
  let selectedNoteSlug: string | null = null
  let selectedNote: VaultNotePayload | null = null
  let noteNeighborhood: VaultNoteNeighborhood | null = null

  if (requestedSlug) {
    const matchingNoteInFolder = folderListing.notes.find((note) => note.slug === requestedSlug)
    const requestedNote = matchingNoteInFolder
      ? index.byRelPath.get(matchingNoteInFolder.relPath) ?? null
      : index.bySlug.get(requestedSlug) ?? null

    if (requestedNote && isNoteInFolder(requestedNote.relPath, folderListing.path)) {
      selectedNoteSlug = requestedSlug
      selectedNote = toVaultNotePayload(requestedNote, getNoteBacklinks(index, requestedNote.relPath))
      noteNeighborhood = getNoteNeighborhood(index, requestedNote)
    }
  }

  if (!selectedNote) {
    const fallback = folderListing.notes[0]
    if (fallback) {
      selectedNoteSlug = fallback.slug
      const parsed = index.byRelPath.get(fallback.relPath)
      selectedNote = parsed ? toVaultNotePayload(parsed, getNoteBacklinks(index, parsed.relPath)) : null
      noteNeighborhood = parsed ? getNoteNeighborhood(index, parsed) : null
    }
  }

  return {
    tree,
    folder: folderListing,
    selectedNoteSlug,
    note: selectedNote,
    noteNeighborhood,
  }
}

async function readNoteFromRebuiltIndex(relPath: string): Promise<{ index: LoadedVaultIndex; note: VaultNotePayload }> {
  const index = await rebuildVaultIndex()
  const parsed = index.byRelPath.get(relPath)

  if (!parsed) {
    throw new Error(`Expected note "${relPath}" to exist after write`)
  }

  return {
    index,
    note: toVaultNotePayload(parsed, getNoteBacklinks(index, relPath)),
  }
}

export async function createVaultFolder(folderPathInput: string): Promise<VaultFolderCreateResult> {
  const normalizedPath = normalizeFolderCreatePathInput(folderPathInput)
  const { rootPath } = await getVaultConfig()
  const created = await createVaultFolderOnDisk(rootPath, normalizedPath)
  const index = await rebuildVaultIndex()

  return {
    path: normalizedPath,
    created,
    builtAt: index.builtAt,
  }
}

export async function createVaultNote(input: VaultNoteWriteInput): Promise<VaultNoteCreateResult> {
  const normalizedPath = normalizeMarkdownNotePathInput(input.path)
  const rawMarkdown = normalizeRawMarkdownInput(input.rawMarkdown)
  const { rootPath } = await getVaultConfig()

  try {
    await createVaultMarkdownFile(rootPath, normalizedPath, rawMarkdown)
  } catch (error) {
    if (error instanceof VaultFileAlreadyExistsError) {
      throw new Error(`Note already exists: ${normalizedPath}`)
    }

    throw error
  }

  const { index, note } = await readNoteFromRebuiltIndex(normalizedPath)

  return {
    builtAt: index.builtAt,
    created: true,
    note,
  }
}

export async function updateVaultNote(input: VaultNoteWriteInput): Promise<VaultNoteUpdateResult> {
  const normalizedPath = normalizeMarkdownNotePathInput(input.path)
  const rawMarkdown = normalizeRawMarkdownInput(input.rawMarkdown)
  const { rootPath } = await getVaultConfig()

  try {
    await updateVaultMarkdownFile(rootPath, normalizedPath, rawMarkdown)
  } catch (error) {
    if (error instanceof VaultFileNotFoundError) {
      throw new Error(`Note not found: ${normalizedPath}`)
    }

    throw error
  }

  const { index, note } = await readNoteFromRebuiltIndex(normalizedPath)

  return {
    builtAt: index.builtAt,
    updated: true,
    note,
  }
}

export async function moveVaultNote(input: VaultNoteMoveInput): Promise<VaultNoteMoveResult> {
  const fromPath = normalizeMarkdownNotePathInput(input.path)
  const toPath = normalizeMarkdownNotePathInput(input.toPath)
  const { rootPath } = await getVaultConfig()

  try {
    await moveVaultMarkdownFile(rootPath, fromPath, toPath)
  } catch (error) {
    if (error instanceof VaultFileNotFoundError) {
      throw new Error(`Note not found: ${fromPath}`)
    }

    if (error instanceof VaultPathConflictError) {
      throw new Error(`Destination already exists: ${toPath}`)
    }

    throw error
  }

  const { index, note } = await readNoteFromRebuiltIndex(toPath)

  return {
    builtAt: index.builtAt,
    moved: true,
    fromPath,
    toPath,
    note,
  }
}

export async function deleteVaultNote(pathInput: string | null | undefined): Promise<VaultNoteDeleteResult> {
  const normalizedPath = normalizeMarkdownNotePathInput(pathInput)
  const { rootPath } = await getVaultConfig()

  try {
    await deleteVaultMarkdownFile(rootPath, normalizedPath)
  } catch (error) {
    if (error instanceof VaultFileNotFoundError) {
      throw new Error(`Note not found: ${normalizedPath}`)
    }

    throw error
  }

  const index = await rebuildVaultIndex()

  return {
    builtAt: index.builtAt,
    deleted: true,
    note: {
      relPath: normalizedPath,
    },
  }
}

export async function deleteVaultFolder(folderPathInput: string | null | undefined): Promise<VaultFolderDeleteResult> {
  const normalizedPath = normalizeFolderPathInput(folderPathInput)
  const { rootPath } = await getVaultConfig()

  try {
    await deleteVaultFolderOnDisk(rootPath, normalizedPath)
  } catch (error) {
    if (error instanceof VaultFolderNotFoundError) {
      throw new Error(`Folder not found: ${normalizedPath}`)
    }

    if (error instanceof VaultFolderNotEmptyError) {
      throw new Error(`Folder not empty: ${normalizedPath}`)
    }

    throw error
  }

  const index = await rebuildVaultIndex()

  return {
    builtAt: index.builtAt,
    deleted: true,
    path: normalizedPath,
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
  const normalizedTag = normalizeSearchTag(input.tag)
  const limit = normalizeSearchLimit(input.limit)
  const offset = normalizeSearchOffset(input.offset)
  const index = await getVaultIndex()

  return searchVaultIndex({
    notes: index.notes,
    query: queryData.query,
    path: normalizedPath,
    tag: normalizedTag,
    limit,
    offset,
  })
}

export async function getVaultSearchResponse(input: {
  query: string | null | undefined
  path: string | null | undefined
  tag: string | null | undefined
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
    tag: input.tag,
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

  if (normalizedPath && !index.folderSet.has(normalizedPath)) {
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

export async function getVaultNoteNeighborhoodResponse(pathInput: string | null | undefined): Promise<Response> {
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

  const index = await getVaultIndex()
  const note = index.byRelPath.get(normalizedPath)

  if (!note) {
    return Response.json(
      {
        error: 'Note not found',
        path: normalizedPath,
      },
      { status: 404 },
    )
  }

  return Response.json({
    builtAt: index.builtAt,
    ...getNoteNeighborhood(index, note),
  })
}

export async function createVaultFolderResponse(input: { path: string | null | undefined }): Promise<Response> {
  let created: VaultFolderCreateResult

  try {
    created = await createVaultFolder(input.path ?? '')
  } catch {
    return Response.json(
      {
        error: 'Invalid folder path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }

  return Response.json(
    {
      builtAt: created.builtAt,
      folder: {
        path: created.path,
        created: created.created,
      },
    },
    { status: created.created ? 201 : 200 },
  )
}

export async function createVaultNoteResponse(input: VaultNoteWriteInput): Promise<Response> {
  try {
    const created = await createVaultNote(input)
    return Response.json(created, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Note already exists: ')) {
      const notePath = error.message.replace('Note already exists: ', '')
      return Response.json(
        {
          error: 'Note already exists',
          path: notePath,
        },
        { status: 409 },
      )
    }

    return Response.json(
      {
        error: 'Invalid note path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
}

export async function updateVaultNoteByPathResponse(input: VaultNoteWriteInput): Promise<Response> {
  try {
    const updated = await updateVaultNote(input)
    return Response.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Note not found: ')) {
      const notePath = error.message.replace('Note not found: ', '')
      return Response.json(
        {
          error: 'Note not found',
          path: notePath,
        },
        { status: 404 },
      )
    }

    return Response.json(
      {
        error: 'Invalid note path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
}

export async function moveVaultNoteByPathResponse(input: VaultNoteMoveInput): Promise<Response> {
  try {
    const moved = await moveVaultNote(input)
    return Response.json(moved)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Note not found: ')) {
      const notePath = error.message.replace('Note not found: ', '')
      return Response.json(
        {
          error: 'Note not found',
          path: notePath,
        },
        { status: 404 },
      )
    }

    if (error instanceof Error && error.message.startsWith('Destination already exists: ')) {
      const notePath = error.message.replace('Destination already exists: ', '')
      return Response.json(
        {
          error: 'Destination already exists',
          path: notePath,
        },
        { status: 409 },
      )
    }

    return Response.json(
      {
        error: 'Invalid note path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
}

export async function deleteVaultNoteByPathResponse(input: { path: string | null | undefined }): Promise<Response> {
  try {
    const deleted = await deleteVaultNote(input.path)
    return Response.json(deleted)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Note not found: ')) {
      const notePath = error.message.replace('Note not found: ', '')
      return Response.json(
        {
          error: 'Note not found',
          path: notePath,
        },
        { status: 404 },
      )
    }

    return Response.json(
      {
        error: 'Invalid note path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
}

export async function deleteVaultFolderResponse(input: { path: string | null | undefined }): Promise<Response> {
  try {
    const deleted = await deleteVaultFolder(input.path)
    return Response.json({
      builtAt: deleted.builtAt,
      deleted: true,
      folder: {
        path: deleted.path,
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Folder not found: ')) {
      const folderPath = error.message.replace('Folder not found: ', '')
      return Response.json(
        {
          error: 'Folder not found',
          path: folderPath,
        },
        { status: 404 },
      )
    }

    if (error instanceof Error && error.message.startsWith('Folder not empty: ')) {
      const folderPath = error.message.replace('Folder not empty: ', '')
      return Response.json(
        {
          error: 'Folder not empty',
          path: folderPath,
        },
        { status: 409 },
      )
    }

    return Response.json(
      {
        error: 'Invalid folder path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
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
  VaultNoteNeighborhood,
  VaultIndexSummaryNote,
  VaultNotePayload,
  VaultPathLookup,
  VaultSearchResponse,
  VaultSlugLookup,
}
