import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  isPublicReadLinkPrincipal,
  OWNER_VAULT_PRINCIPAL,
  assertVaultPathAccess,
  vaultPrincipalHeaders,
  VaultAuthorizationError,
  type VaultPrincipal,
} from '../auth/authorization'
import { normalizeVaultPath } from '../paths'
import { hashVaultNote, hashVaultRawMarkdown } from './content-hash'
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
import { normalizeStructuredNoteDocument, renderCanonicalMarkdown, type VaultStructuredNoteDocument } from './write-note'
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

export type { VaultBacklink, VaultFolderTreeNode } from './types'

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
  revision?: string
  rawMarkdown: string
  rawContentHash: string
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
  document?: VaultStructuredNoteDocument | null | undefined
  principal?: VaultPrincipal
}

type VaultNoteUpdateInput = VaultNoteWriteInput & {
  expectedContentHash?: string | null | undefined
  expectedRevision?: string | null | undefined
  expectedRawContentHash?: string | null | undefined
}

type VaultNoteMoveInput = {
  path: string | null | undefined
  toPath: string | null | undefined
  expectedContentHash?: string | null | undefined
  expectedRevision?: string | null | undefined
  principal?: VaultPrincipal
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
  migration?: RevisionMigrationNotice
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
  migration?: RevisionMigrationNotice
}

type VaultSearchInput = {
  query: string
  path?: string | null
  tag?: string | null
  limit?: number | null
  offset?: number | null
  principal?: VaultPrincipal
}

export type RevisionMigrationNotice = {
  code: 'WRITE_REVISION_MIGRATION_REQUIRED'
  message: string
  nextAction: string
}

export class VaultWriteRevisionError extends Error {
  public readonly nextAction: string

  constructor(
    public readonly code: 'WRITE_REVISION_REQUIRED' | 'STALE_NOTE_REVISION',
    public readonly relPath: string,
    public readonly readUrl: string,
    public readonly currentRevision: string | null,
    public readonly status: 409 | 428,
  ) {
    super(
      code === 'WRITE_REVISION_REQUIRED'
        ? 'A note revision is required before this write.'
        : 'The note changed since it was read; re-read, merge, and retry with the latest revision.',
    )
    this.nextAction =
      code === 'WRITE_REVISION_REQUIRED'
        ? 'Read the note first, then retry with its revision in If-Match or expectedRevision.'
        : 'Re-read the note, merge your changes, then retry with the latest revision in If-Match or expectedRevision.'
    this.name = 'VaultWriteRevisionError'
  }
}

let cachedIndex: LoadedVaultIndex | null = null
let inFlightBuild: Promise<LoadedVaultIndex> | null = null
let vaultMutationQueue = Promise.resolve()

async function withVaultMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = vaultMutationQueue
  let release!: () => void
  vaultMutationQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous
  try {
    return await operation()
  } finally {
    release()
  }
}

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

function getPrincipal(principal: VaultPrincipal | undefined): VaultPrincipal {
  return principal ?? OWNER_VAULT_PRINCIPAL
}

function isFullVaultPrincipal(principal: VaultPrincipal): boolean {
  return principal.kind === 'owner' || principal.kind === 'owner-agent'
}

function isPathInPrincipalScope(principal: VaultPrincipal, relPath: string): boolean {
  return isFullVaultPrincipal(principal) || relPath === principal.rootPath || relPath.startsWith(`${principal.rootPath}/`)
}

const PUBLIC_INACCESSIBLE_LINK_TARGET = '#nabu-inaccessible'
const PUBLIC_INACCESSIBLE_LINK_LABEL = 'Non-accessible link'
const PUBLIC_SHARED_SPACE_UNAVAILABLE = 'Shared space unavailable'

function publicReadHeaders(principal: VaultPrincipal, headers?: HeadersInit): Headers {
  return vaultPrincipalHeaders(principal, headers)
}

function publicUnavailableResponse(principal: VaultPrincipal, status = 404): Response {
  return Response.json(
    { error: isPublicReadLinkPrincipal(principal) ? PUBLIC_SHARED_SPACE_UNAVAILABLE : 'The requested vault resource is not available.' },
    { status, headers: publicReadHeaders(principal) },
  )
}

function mutationResponse(principal: VaultPrincipal, body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: publicReadHeaders(principal, init.headers),
  })
}

function stripLinkExtras(target: string): string {
  const withoutHash = target.split('#')[0] ?? target
  return (withoutHash.split('?')[0] ?? withoutHash).trim()
}

function parseMarkdownTarget(target: string): string {
  const trimmed = target.trim()
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim()
  }

  const whitespaceIndex = trimmed.search(/\s/)
  return whitespaceIndex === -1 ? trimmed : trimmed.slice(0, whitespaceIndex).trim()
}

function candidateLinkPath(noteRelPath: string, kind: 'wiki' | 'markdown', target: string): string | null {
  const strippedTarget = stripLinkExtras(target)
  if (!strippedTarget || strippedTarget.startsWith('#') || strippedTarget.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(strippedTarget)) {
    return null
  }

  const pathTarget = kind === 'wiki'
    ? strippedTarget.startsWith('/')
      ? strippedTarget.slice(1)
      : strippedTarget
    : strippedTarget.startsWith('/')
      ? strippedTarget.slice(1)
      : path.posix.normalize(path.posix.join(path.posix.dirname(noteRelPath), strippedTarget))

  try {
    return normalizeVaultPath(pathTarget)
  } catch {
    return '__outside_scope__'
  }
}

function collectPublicInaccessibleLinks(note: ParsedVaultNote, principal: VaultPrincipal): VaultNoteLink[] {
  const inaccessible = new Map<string, VaultNoteLink>()

  const add = (raw: string, link: VaultNoteLink) => {
    if (!raw || inaccessible.has(raw)) {
      return
    }

    inaccessible.set(raw, {
      ...link,
      raw,
      text: PUBLIC_INACCESSIBLE_LINK_LABEL,
      target: PUBLIC_INACCESSIBLE_LINK_TARGET,
      resolved: false,
      targetRelPath: null,
      targetSlug: null,
      targetTitle: undefined,
      inaccessible: true,
    })
  }

  for (const link of note.outgoingLinks) {
    const targetPath = link.resolved && link.targetRelPath
      ? link.targetRelPath
      : candidateLinkPath(note.relPath, link.kind, link.target)

    if (targetPath && !isPathInPrincipalScope(principal, targetPath)) {
      if (note.body.includes(`!${link.raw}`)) {
        add(`!${link.raw}`, link)
      } else {
        add(link.raw, link)
      }
    }
  }

  const markdownLinkRegex = /!?\[[^\]]*\]\(([^)]+)\)/g
  for (const match of note.body.matchAll(markdownLinkRegex)) {
    const raw = match[0] ?? ''
    const target = parseMarkdownTarget(match[1] ?? '')
    const original = note.outgoingLinks.find((link) => link.raw === raw || link.raw === raw.slice(1))
    const targetPath = original?.resolved && original.targetRelPath
      ? original.targetRelPath
      : candidateLinkPath(note.relPath, 'markdown', target)
    if (raw && targetPath && !isPathInPrincipalScope(principal, targetPath)) {
      add(raw, original ?? {
        raw,
        kind: 'markdown',
        text: null,
        target,
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      })
    }
  }

  const wikiLinkRegex = /!?\[\[([^\]]+)\]\]/g
  for (const match of note.body.matchAll(wikiLinkRegex)) {
    const raw = match[0] ?? ''
    const rawTarget = (match[1] ?? '').trim()
    const aliasSeparatorIndex = rawTarget.indexOf('|')
    const target = (aliasSeparatorIndex === -1 ? rawTarget : rawTarget.slice(0, aliasSeparatorIndex)).trim()
    const original = note.outgoingLinks.find((link) => link.raw === raw || link.raw === raw.slice(1))
    const targetPath = original?.resolved && original.targetRelPath
      ? original.targetRelPath
      : candidateLinkPath(note.relPath, 'wiki', target)
    if (raw && targetPath && !isPathInPrincipalScope(principal, targetPath)) {
      add(raw, original ?? {
        raw,
        kind: 'wiki',
        text: null,
        target,
        resolved: false,
        targetRelPath: null,
        targetSlug: null,
      })
    }
  }

  return [...inaccessible.values()]
}

function createPublicScopedNote(note: ParsedVaultNote, principal: VaultPrincipal): ParsedVaultNote {
  const inaccessibleLinks = collectPublicInaccessibleLinks(note, principal)
  const replacements = inaccessibleLinks
    .map((link, index) => ({
      raw: link.raw,
      replacement: `[${PUBLIC_INACCESSIBLE_LINK_LABEL}](#${PUBLIC_INACCESSIBLE_LINK_TARGET.slice(1)}-${index + 1})`,
    }))
  const replacementOrder = [...replacements].sort((left, right) => right.raw.length - left.raw.length)

  let body = note.body.replace(/^\s*\*\*(?:Source|References):\*\*.*(?:\r?\n|$)/gim, '')
  for (const replacement of replacementOrder) {
    body = body.split(replacement.raw).join(replacement.replacement)
  }

  const parsed = parseNote({ relPath: note.relPath, rawMarkdown: body })
  // Keep the public projection explicit so new ParsedVaultNote metadata cannot
  // become visible merely by being added to the parser or payload type.
  const publicMetadata = {
    title: note.title,
    slug: note.slug,
    summary: note.summary,
    tags: [...note.tags],
    authors: [...note.authors],
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  }
  parsed.title = publicMetadata.title
  parsed.slug = publicMetadata.slug
  parsed.summary = publicMetadata.summary
  parsed.tags = publicMetadata.tags
  parsed.authors = publicMetadata.authors
  parsed.source = null
  parsed.references = []
  parsed.createdAt = publicMetadata.createdAt
  parsed.updatedAt = publicMetadata.updatedAt
  parsed.frontmatter = {}
  parsed.body = body
  parsed.rawMarkdown = body
  parsed.warnings = note.warnings
  const accessibleResolvedLinks = new Map(
    note.outgoingLinks
      .filter((link) => link.resolved && link.targetRelPath && isPathInPrincipalScope(principal, link.targetRelPath))
      .map((link) => [link.raw, link]),
  )
  parsed.outgoingLinks = parsed.outgoingLinks.map((link) => accessibleResolvedLinks.get(link.raw) ?? link)
  parsed.outgoingLinks.push(
    ...inaccessibleLinks.map((link, index) => ({
      ...link,
      raw: replacements[index]?.replacement ?? `[${PUBLIC_INACCESSIBLE_LINK_LABEL}](#nabu-inaccessible)`,
    })),
  )

  return parsed
}

function createScopedIndex(index: LoadedVaultIndex, principal: VaultPrincipal): LoadedVaultIndex {
  if (isFullVaultPrincipal(principal)) {
    return index
  }

  const scopedNotes = index.notes
    .filter((note) => isPathInPrincipalScope(principal, note.relPath))
    .map((note) => {
      if (isPublicReadLinkPrincipal(principal)) {
        return createPublicScopedNote(note, principal)
      }

      const visibleLinkRaws = new Set(
        note.outgoingLinks
          .filter((link) => !link.resolved || (link.targetRelPath != null && isPathInPrincipalScope(principal, link.targetRelPath)))
          .map((link) => link.raw),
      )
      const parsed = parseNote({ relPath: note.relPath, rawMarkdown: note.rawMarkdown })
      parsed.outgoingLinks = parsed.outgoingLinks.filter((link) => visibleLinkRaws.has(link.raw))
      return parsed
    })
  const scopedFolders = [
    principal.rootPath,
    ...index.folders.filter((folderPath) => isPathInPrincipalScope(principal, folderPath)),
  ]

  return toLoadedVaultIndex(
    buildVaultIndex(scopedNotes, { folderPaths: scopedFolders }),
    index.sourceRoot,
  )
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

async function getVaultIndexForPrincipal(principal: VaultPrincipal): Promise<LoadedVaultIndex> {
  const index = await loadVaultIndex(principal.kind === 'shared')
  return createScopedIndex(index, principal)
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
    revision: hashVaultRawMarkdown(note.rawMarkdown),
    rawMarkdown: note.rawMarkdown,
    rawContentHash: hashVaultRawMarkdown(note.rawMarkdown),
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

function normalizeScopedFolderPathInput(
  folderPath: string | null | undefined,
  principal: VaultPrincipal,
): string {
  const normalizedPath = normalizeFolderPathInput(folderPath)
  if (isFullVaultPrincipal(principal)) {
    return normalizedPath
  }

  const scopedPath = normalizedPath || principal.rootPath
  assertVaultPathAccess(principal, scopedPath)
  return scopedPath
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

function normalizeFolderDeletePathInput(folderPath: string | null | undefined): string {
  const normalized = normalizeFolderPathInput(folderPath)

  if (!normalized) {
    throw new Error('Folder path is required')
  }

  return normalized
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

function materializeNoteMarkdown(
  input: VaultNoteWriteInput,
  timestamps: { createdAt?: string | null; updatedAt?: string | null } = {},
): string {
  const hasRawMarkdown = typeof input.rawMarkdown === 'string' && input.rawMarkdown.trim().length > 0
  const hasDocument = input.document != null

  if (hasRawMarkdown && hasDocument) {
    throw new Error('Invalid note write payload')
  }

  if (hasDocument) {
    try {
      return renderCanonicalMarkdown(normalizeStructuredNoteDocument(input.document ?? {}, timestamps))
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid structured note document') {
        throw new Error('Invalid note write payload')
      }

      throw error
    }
  }

  return normalizeRawMarkdownInput(input.rawMarkdown)
}

function currentIsoTimestamp(): string {
  return new Date().toISOString()
}

async function getExistingNoteCreatedAt(rootPath: string, relPath: string): Promise<string | null> {
  try {
    const rawMarkdown = await readFile(path.join(rootPath, relPath), 'utf8')
    return parseNote({ relPath, rawMarkdown }).createdAt
  } catch {
    return null
  }
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

export async function getNoteBySlug(slug: string, principalInput?: VaultPrincipal): Promise<VaultSlugLookup | null> {
  const normalizedSlug = normalizeSlugInput(slug)

  if (!normalizedSlug) {
    return null
  }

  const index = await getVaultIndexForPrincipal(getPrincipal(principalInput))
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

export async function getNoteByPath(relPath: string, principalInput?: VaultPrincipal): Promise<VaultPathLookup | null> {
  const normalizedPath = normalizeVaultPath(relPath)
  const principal = getPrincipal(principalInput)
  assertVaultPathAccess(principal, normalizedPath)
  const index = await getVaultIndexForPrincipal(principal)
  const note = index.byRelPath.get(normalizedPath)

  if (!note) {
    return null
  }

  return {
    builtAt: index.builtAt,
    note: toVaultNotePayload(note, getNoteBacklinks(index, note.relPath)),
  }
}

export async function getNoteNeighborhoodByPath(
  relPath: string,
  principalInput?: VaultPrincipal,
): Promise<VaultNoteNeighborhood | null> {
  const normalizedPath = normalizeVaultPath(relPath)
  const principal = getPrincipal(principalInput)
  assertVaultPathAccess(principal, normalizedPath)
  const index = await getVaultIndexForPrincipal(principal)
  const note = index.byRelPath.get(normalizedPath)

  if (!note) {
    return null
  }

  return getNoteNeighborhood(index, note)
}

export async function getVaultTree(principalInput?: VaultPrincipal): Promise<VaultFolderTreeNode> {
  const index = await getVaultIndexForPrincipal(getPrincipal(principalInput))
  const { folderChildren, folderNotes } = createFolderMaps(index)
  return buildFolderTreeNode('', folderChildren, folderNotes)
}

export async function getFolderListing(
  folderPathInput: string,
  principalInput?: VaultPrincipal,
): Promise<VaultFolderListing | null> {
  const principal = getPrincipal(principalInput)
  const folderPath = normalizeScopedFolderPathInput(folderPathInput, principal)
  const index = await getVaultIndexForPrincipal(principal)

  if (folderPath && !index.folderSet.has(folderPath)) {
    return null
  }

  const { folderChildren, folderNotes } = createFolderMaps(index)
  return buildFolderListing(folderPath, folderChildren, folderNotes)
}

export async function getVaultBrowseData(input: {
  folderPath: string | null | undefined
  noteSlug: string | null | undefined
  principal?: VaultPrincipal
}): Promise<VaultBrowseData> {
  const principal = getPrincipal(input.principal)
  const index = await getVaultIndexForPrincipal(principal)
  const { folderChildren, folderNotes } = createFolderMaps(index)
  const tree = buildFolderTreeNode(principal.kind === 'shared' ? principal.rootPath : '', folderChildren, folderNotes)

  let folderPath = ''
  try {
    folderPath = normalizeScopedFolderPathInput(input.folderPath ?? '', principal)
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      throw error
    }

    if (isPublicReadLinkPrincipal(principal)) {
      throw new VaultAuthorizationError('The requested vault resource is not available.')
    }

    folderPath = principal.kind === 'shared' ? principal.rootPath : ''
  }

  if (folderPath && !index.folderSet.has(folderPath)) {
    if (principal.kind === 'shared') {
      throw new VaultAuthorizationError('The requested vault resource is not available.')
    }

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

async function assertExpectedContentHash(relPath: string, expectedContentHash: string | null | undefined): Promise<void> {
  if (!expectedContentHash) {
    return
  }

  const index = await rebuildVaultIndex()
  const parsed = index.byRelPath.get(relPath)
  if (!parsed) {
    throw new Error(`Note not found: ${relPath}`)
  }

  const currentNote = toVaultNotePayload(parsed, getNoteBacklinks(index, relPath))
  if (hashVaultNote(currentNote) !== expectedContentHash) {
    throw new Error('Note changed since it was read; retry with the latest contentHash')
  }
}

async function assertExpectedRawContentHash(relPath: string, expectedRawContentHash: string | null | undefined): Promise<void> {
  if (!expectedRawContentHash) {
    return
  }

  const index = await rebuildVaultIndex()
  const parsed = index.byRelPath.get(relPath)
  if (!parsed) {
    throw new Error(`Note not found: ${relPath}`)
  }

  if (hashVaultRawMarkdown(parsed.rawMarkdown) !== expectedRawContentHash) {
    throw new Error('Note changed since it was read; retry with the latest rawContentHash')
  }
}

export async function createVaultFolder(
  folderPathInput: string,
  principalInput?: VaultPrincipal,
): Promise<VaultFolderCreateResult> {
  return withVaultMutation(async () => {
    const normalizedPath = normalizeFolderCreatePathInput(folderPathInput)
    const principal = getPrincipal(principalInput)
    assertVaultPathAccess(principal, normalizedPath, 'write')
    const { rootPath } = await getVaultConfig()
    const created = await createVaultFolderOnDisk(rootPath, normalizedPath)
    const index = await rebuildVaultIndex()

    return {
      path: normalizedPath,
      created,
      builtAt: index.builtAt,
    }
  })
}

export async function createVaultNote(input: VaultNoteWriteInput): Promise<VaultNoteCreateResult> {
  return withVaultMutation(async () => {
    const normalizedPath = normalizeMarkdownNotePathInput(input.path)
    const principal = getPrincipal(input.principal)
    assertVaultPathAccess(principal, normalizedPath, 'write')
    const { rootPath } = await getVaultConfig()
    const now = currentIsoTimestamp()
    const rawMarkdown = input.document
      ? materializeNoteMarkdown(input, {
          createdAt: now,
          updatedAt: now,
        })
      : materializeNoteMarkdown(input)

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
  })
}

export async function updateVaultNote(input: VaultNoteUpdateInput): Promise<VaultNoteUpdateResult> {
  return withVaultMutation(async () => {
    const normalizedPath = normalizeMarkdownNotePathInput(input.path)
    const principal = getPrincipal(input.principal)
    assertVaultPathAccess(principal, normalizedPath, 'write')
    const { rootPath } = await getVaultConfig()
    const revisionCheck = await assertWriteRevision({
      rootPath,
      relPath: normalizedPath,
      principal,
      expectedRevision: input.expectedRevision,
      expectedContentHash: input.expectedContentHash,
    })
    await assertExpectedRawContentHash(normalizedPath, input.expectedRawContentHash)
    const now = currentIsoTimestamp()
    const rawMarkdown = input.document
      ? materializeNoteMarkdown(input, {
          createdAt: (await getExistingNoteCreatedAt(rootPath, normalizedPath)) ?? now,
          updatedAt: now,
        })
      : materializeNoteMarkdown(input)

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
      migration: revisionMigrationNotice(principal, revisionCheck.usedLegacyCompatibility) ?? undefined,
    }
  })
}

export async function moveVaultNote(input: VaultNoteMoveInput): Promise<VaultNoteMoveResult> {
  return withVaultMutation(async () => {
    const fromPath = normalizeMarkdownNotePathInput(input.path)
    const toPath = normalizeMarkdownNotePathInput(input.toPath)
    const principal = getPrincipal(input.principal)
    assertVaultPathAccess(principal, fromPath, 'write')
    assertVaultPathAccess(principal, toPath, 'write')
    const { rootPath } = await getVaultConfig()
    const revisionCheck = await assertWriteRevision({
      rootPath,
      relPath: fromPath,
      principal,
      expectedRevision: input.expectedRevision,
      expectedContentHash: input.expectedContentHash,
    })

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
      migration: revisionMigrationNotice(principal, revisionCheck.usedLegacyCompatibility) ?? undefined,
    }
  })
}

export async function deleteVaultNote(
  pathInput: string | null | undefined,
  principalInput?: VaultPrincipal,
): Promise<VaultNoteDeleteResult> {
  return withVaultMutation(async () => {
    const normalizedPath = normalizeMarkdownNotePathInput(pathInput)
    const principal = getPrincipal(principalInput)
    assertVaultPathAccess(principal, normalizedPath, 'write')
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
  })
}

export async function deleteVaultFolder(
  folderPathInput: string | null | undefined,
  principalInput?: VaultPrincipal,
): Promise<VaultFolderDeleteResult> {
  return withVaultMutation(async () => {
    const normalizedPath = normalizeFolderDeletePathInput(folderPathInput)
    const principal = getPrincipal(principalInput)
    assertVaultPathAccess(principal, normalizedPath, 'write')
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
  })
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

  const principal = getPrincipal(input.principal)
  let normalizedPath: string
  try {
    normalizedPath = normalizeSearchPath(input.path)
  } catch (error) {
    if (isPublicReadLinkPrincipal(principal)) {
      throw new VaultAuthorizationError('The requested vault resource is not available.')
    }

    throw error
  }
  const scopedSearchPath = principal.kind === 'shared' && !normalizedPath ? principal.rootPath : normalizedPath
  assertVaultPathAccess(principal, scopedSearchPath)
  const normalizedTag = normalizeSearchTag(input.tag)
  const limit = normalizeSearchLimit(input.limit)
  const offset = normalizeSearchOffset(input.offset)
  const index = await getVaultIndexForPrincipal(principal)

  return searchVaultIndex({
    notes: index.notes,
    searchDocuments: index.searchDocuments,
    query: queryData.query,
    path: scopedSearchPath,
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
  principal?: VaultPrincipal
}): Promise<Response> {
  const principal = getPrincipal(input.principal)
  const rawQuery = input.query ?? ''
  const normalizedQuery = normalizeSearchQuery(rawQuery).normalizedQuery

  if (!normalizedQuery) {
    return Response.json(
      {
        error: 'Search query is required',
      },
      { status: 400, headers: publicReadHeaders(principal) },
    )
  }

  let normalizedPath = ''
  try {
    normalizedPath = normalizeSearchPath(input.path)
  } catch {
    if (isPublicReadLinkPrincipal(principal)) {
      return publicUnavailableResponse(principal)
    }

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

  let result: VaultSearchResponse
  try {
    result = await searchVaultNotes({
      query: rawQuery,
      path: normalizedPath,
      tag: input.tag,
      limit: Number.isNaN(parsedLimit) ? null : parsedLimit,
      offset: Number.isNaN(parsedOffset) ? null : parsedOffset,
      principal: input.principal,
    })
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      return publicUnavailableResponse(principal, error.status)
    }
    throw error
  }
  const index = await getVaultIndexForPrincipal(principal)

  return Response.json({
    builtAt: index.builtAt,
    ...result,
  }, { headers: publicReadHeaders(principal) })
}

export async function getVaultIndexResponse(principalInput?: VaultPrincipal): Promise<Response> {
  const principal = getPrincipal(principalInput)
  const index = await getVaultIndexForPrincipal(principal)

  return Response.json({
    builtAt: index.builtAt,
    stats: index.stats,
    warnings: index.warnings,
    folders: index.folders,
    notes: index.notes.map(toSummaryNote),
  }, { headers: publicReadHeaders(principal) })
}

export async function getVaultIndexStatsResponse(principalInput?: VaultPrincipal): Promise<Response> {
  const principal = getPrincipal(principalInput)
  const index = await getVaultIndexForPrincipal(principal)

  return Response.json({
    builtAt: index.builtAt,
    stats: index.stats,
    warnings: index.warnings,
  }, { headers: publicReadHeaders(principal) })
}

export async function getVaultTreeResponse(principalInput?: VaultPrincipal): Promise<Response> {
  const principal = getPrincipal(principalInput)
  const index = await getVaultIndexForPrincipal(principal)
  const { folderChildren, folderNotes } = createFolderMaps(index)

  return Response.json({
    builtAt: index.builtAt,
    tree: buildFolderTreeNode(principal.kind === 'shared' ? principal.rootPath : '', folderChildren, folderNotes),
  }, { headers: publicReadHeaders(principal) })
}

function requiresWriteRevision(principal: VaultPrincipal): boolean {
  return principal.kind === 'shared' || ['1', 'true', 'yes'].includes((process.env.NABU_REQUIRE_WRITE_REVISION ?? '').trim().toLowerCase())
}

function revisionReadUrl(relPath: string): string {
  return `/api/vault/notes/by-path?path=${encodeURIComponent(relPath)}`
}

async function assertWriteRevision(input: {
  rootPath: string
  relPath: string
  principal: VaultPrincipal
  expectedRevision?: string | null
  expectedContentHash?: string | null
}): Promise<{ usedLegacyCompatibility: boolean }> {
  const expectedRevision = input.expectedRevision?.trim() || null
  if (expectedRevision) {
    let rawMarkdown: string
    try {
      rawMarkdown = await readFile(path.join(input.rootPath, input.relPath), 'utf8')
    } catch {
      throw new Error(`Note not found: ${input.relPath}`)
    }

    const currentRevision = hashVaultRawMarkdown(rawMarkdown)
    if (currentRevision !== expectedRevision) {
      throw new VaultWriteRevisionError(
        'STALE_NOTE_REVISION',
        input.relPath,
        revisionReadUrl(input.relPath),
        currentRevision,
        409,
      )
    }

    return { usedLegacyCompatibility: false }
  }

  if (requiresWriteRevision(input.principal)) {
    throw new VaultWriteRevisionError(
      'WRITE_REVISION_REQUIRED',
      input.relPath,
      revisionReadUrl(input.relPath),
      null,
      428,
    )
  }

  await assertExpectedContentHash(input.relPath, input.expectedContentHash)
  return { usedLegacyCompatibility: true }
}

function revisionMigrationNotice(principal: VaultPrincipal, usedLegacyCompatibility: boolean): RevisionMigrationNotice | null {
  if (!isFullVaultPrincipal(principal) || !usedLegacyCompatibility) {
    return null
  }

  return {
    code: 'WRITE_REVISION_MIGRATION_REQUIRED',
    message: 'Legacy owner writes are temporarily accepted. Agents must migrate to revision-aware writes.',
    nextAction: 'Read the note, keep its revision, and send it as If-Match or expectedRevision on the next update or move.',
  }
}

export async function getVaultFolderListingResponse(
  folderPath: string | null | undefined,
  principalInput?: VaultPrincipal,
): Promise<Response> {
  const principal = getPrincipal(principalInput)
  let normalizedPath: string

  try {
    normalizedPath = normalizeScopedFolderPathInput(folderPath, principal)
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      return publicUnavailableResponse(principal, error.status)
    }

    if (isPublicReadLinkPrincipal(principal)) {
      return publicUnavailableResponse(principal)
    }

    return Response.json(
      {
        error: 'Invalid folder path',
        folder: folderPath ?? '',
      },
      { status: 400 },
    )
  }

  const index = await getVaultIndexForPrincipal(principal)

  if (normalizedPath && !index.folderSet.has(normalizedPath)) {
    if (isPublicReadLinkPrincipal(principal)) {
      return publicUnavailableResponse(principal)
    }

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
  }, { headers: publicReadHeaders(principal) })
}

export async function getVaultNoteBySlugResponse(slug: string, principalInput?: VaultPrincipal): Promise<Response> {
  const principal = getPrincipal(principalInput)
  const found = await getNoteBySlug(slug, principal)

  if (!found) {
    if (isPublicReadLinkPrincipal(principal)) {
      return publicUnavailableResponse(principal)
    }

    return Response.json(
      {
        error: 'Note not found',
        slug: normalizeSlugInput(slug),
      },
      { status: 404 },
    )
  }

  return Response.json(found, { headers: publicReadHeaders(principal, { ETag: `"${found.note.revision}"` }) })
}

export async function getVaultNoteByPathResponse(
  pathInput: string | null | undefined,
  principalInput?: VaultPrincipal,
): Promise<Response> {
  const principal = getPrincipal(principalInput)
  let normalizedPath: string

  try {
    normalizedPath = normalizeNotePathInput(pathInput)
  } catch {
    if (isPublicReadLinkPrincipal(principal)) {
      return publicUnavailableResponse(principal)
    }

    return Response.json(
      {
        error: 'Invalid note path',
        path: pathInput ?? '',
      },
      { status: 400 },
    )
  }

  try {
    const found = await getNoteByPath(normalizedPath, principal)

    if (!found) {
      if (isPublicReadLinkPrincipal(principal)) {
        return publicUnavailableResponse(principal)
      }

      return Response.json(
        {
          error: 'Note not found',
          path: normalizedPath,
        },
        { status: 404 },
      )
    }

    return Response.json(found, { headers: publicReadHeaders(principal, { ETag: `"${found.note.revision}"` }) })
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      return publicUnavailableResponse(principal, error.status)
    }

    throw error
  }
}

export async function getVaultNoteNeighborhoodResponse(
  pathInput: string | null | undefined,
  principalInput?: VaultPrincipal,
): Promise<Response> {
  const principal = getPrincipal(principalInput)
  let normalizedPath: string

  try {
    normalizedPath = normalizeNotePathInput(pathInput)
  } catch {
    if (isPublicReadLinkPrincipal(principal)) {
      return publicUnavailableResponse(principal)
    }

    return Response.json(
      {
        error: 'Invalid note path',
        path: pathInput ?? '',
      },
      { status: 400 },
    )
  }

  try {
    assertVaultPathAccess(principal, normalizedPath)
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      return publicUnavailableResponse(principal, error.status)
    }
    throw error
  }

  const index = await getVaultIndexForPrincipal(principal)
  const note = index.byRelPath.get(normalizedPath)

  if (!note) {
    if (isPublicReadLinkPrincipal(principal)) {
      return publicUnavailableResponse(principal)
    }

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
  }, { headers: publicReadHeaders(principal) })
}

export async function createVaultFolderResponse(input: {
  path: string | null | undefined
  principal?: VaultPrincipal
}): Promise<Response> {
  const principal = getPrincipal(input.principal)
  let created: VaultFolderCreateResult

  try {
    created = await createVaultFolder(input.path ?? '', input.principal)
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      return mutationResponse(principal, { error: 'The requested vault resource is not available.' }, { status: error.status })
    }

    return mutationResponse(
      principal,
      {
        error: 'Invalid folder path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }

  return mutationResponse(
    principal,
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
  const principal = getPrincipal(input.principal)
  try {
    const created = await createVaultNote(input)
    return mutationResponse(principal, created, { status: 201, headers: { ETag: `"${created.note.revision}"` } })
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      return mutationResponse(principal, { error: 'The requested vault resource is not available.' }, { status: error.status })
    }

    if (error instanceof Error && error.message === 'Invalid note write payload') {
      return mutationResponse(
        principal,
        {
          error: 'Invalid request body',
        },
        { status: 400 },
      )
    }

    if (error instanceof Error && error.message.startsWith('Note already exists: ')) {
      const notePath = error.message.replace('Note already exists: ', '')
      return mutationResponse(
        principal,
        {
          error: 'Note already exists',
          path: notePath,
        },
        { status: 409 },
      )
    }

    return mutationResponse(
      principal,
      {
        error: 'Invalid note path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
}

export async function updateVaultNoteByPathResponse(input: VaultNoteUpdateInput): Promise<Response> {
  const principal = getPrincipal(input.principal)
  try {
    const updated = await updateVaultNote(input)
    return mutationResponse(principal, updated, { headers: { ETag: `"${updated.note.revision}"` } })
  } catch (error) {
    if (error instanceof VaultWriteRevisionError) {
      const body = {
        error: error.message,
        code: error.code,
        nextAction: error.nextAction,
        readUrl: error.readUrl,
        ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}),
      }
      return mutationResponse(principal, body, {
        status: error.status,
        headers: error.currentRevision ? { ETag: `"${error.currentRevision}"` } : undefined,
      })
    }

    if (error instanceof VaultAuthorizationError) {
      return mutationResponse(principal, { error: 'The requested vault resource is not available.' }, { status: error.status })
    }

    if (error instanceof Error && error.message === 'Invalid note write payload') {
      return mutationResponse(
        principal,
        {
          error: 'Invalid request body',
        },
        { status: 400 },
      )
    }

    if (error instanceof Error && error.message.startsWith('Note not found: ')) {
      const notePath = error.message.replace('Note not found: ', '')
      return mutationResponse(
        principal,
        {
          error: 'Note not found',
          path: notePath,
        },
        { status: 404 },
      )
    }

    if (error instanceof Error && error.message === 'Note changed since it was read; retry with the latest contentHash') {
      return mutationResponse(
        principal,
        {
          error: error.message,
          code: 'STALE_NOTE_CONTENT_HASH',
          nextAction: 'Re-read the note, merge your changes, then retry with the latest revision-aware write contract.',
          readUrl: revisionReadUrl(normalizeMarkdownNotePathInput(input.path)),
        },
        { status: 409 },
      )
    }

    if (error instanceof Error && error.message === 'Note changed since it was read; retry with the latest rawContentHash') {
      return mutationResponse(principal, { error: error.message }, { status: 409 })
    }

    return mutationResponse(
      principal,
      {
        error: 'Invalid note path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
}

export async function moveVaultNoteByPathResponse(input: VaultNoteMoveInput): Promise<Response> {
  const principal = getPrincipal(input.principal)
  try {
    const moved = await moveVaultNote(input)
    return mutationResponse(principal, moved, { headers: { ETag: `"${moved.note.revision}"` } })
  } catch (error) {
    if (error instanceof VaultWriteRevisionError) {
      const body = {
        error: error.message,
        code: error.code,
        nextAction: error.nextAction,
        readUrl: error.readUrl,
        ...(error.currentRevision ? { currentRevision: error.currentRevision } : {}),
      }
      return mutationResponse(principal, body, {
        status: error.status,
        headers: error.currentRevision ? { ETag: `"${error.currentRevision}"` } : undefined,
      })
    }

    if (error instanceof VaultAuthorizationError) {
      return mutationResponse(principal, { error: 'The requested vault resource is not available.' }, { status: error.status })
    }
    if (error instanceof Error && error.message.startsWith('Note not found: ')) {
      const notePath = error.message.replace('Note not found: ', '')
      return mutationResponse(
        principal,
        {
          error: 'Note not found',
          path: notePath,
        },
        { status: 404 },
      )
    }

    if (error instanceof Error && error.message.startsWith('Destination already exists: ')) {
      const notePath = error.message.replace('Destination already exists: ', '')
      return mutationResponse(
        principal,
        {
          error: 'Destination already exists',
          path: notePath,
        },
        { status: 409 },
      )
    }

    if (error instanceof Error && error.message === 'Note changed since it was read; retry with the latest contentHash') {
      return mutationResponse(
        principal,
        {
          error: error.message,
          code: 'STALE_NOTE_CONTENT_HASH',
          nextAction: 'Re-read the note, merge your changes, then retry with the latest revision-aware write contract.',
          readUrl: revisionReadUrl(normalizeMarkdownNotePathInput(input.path)),
        },
        { status: 409 },
      )
    }

    return mutationResponse(
      principal,
      {
        error: 'Invalid note path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
}

export async function deleteVaultNoteByPathResponse(input: {
  path: string | null | undefined
  principal?: VaultPrincipal
}): Promise<Response> {
  const principal = getPrincipal(input.principal)
  try {
    const deleted = await deleteVaultNote(input.path, input.principal)
    return mutationResponse(principal, deleted)
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      return mutationResponse(principal, { error: 'The requested vault resource is not available.' }, { status: error.status })
    }

    if (error instanceof Error && error.message.startsWith('Note not found: ')) {
      const notePath = error.message.replace('Note not found: ', '')
      return mutationResponse(
        principal,
        {
          error: 'Note not found',
          path: notePath,
        },
        { status: 404 },
      )
    }

    return mutationResponse(
      principal,
      {
        error: 'Invalid note path',
        path: input.path ?? '',
      },
      { status: 400 },
    )
  }
}

export async function deleteVaultFolderResponse(input: {
  path: string | null | undefined
  principal?: VaultPrincipal
}): Promise<Response> {
  const principal = getPrincipal(input.principal)
  try {
    const deleted = await deleteVaultFolder(input.path, input.principal)
    return mutationResponse(principal, {
      builtAt: deleted.builtAt,
      deleted: true,
      folder: {
        path: deleted.path,
      },
    })
  } catch (error) {
    if (error instanceof VaultAuthorizationError) {
      return mutationResponse(principal, { error: 'The requested vault resource is not available.' }, { status: error.status })
    }

    if (error instanceof Error && error.message.startsWith('Folder not found: ')) {
      const folderPath = error.message.replace('Folder not found: ', '')
      return mutationResponse(
        principal,
        {
          error: 'Folder not found',
          path: folderPath,
        },
        { status: 404 },
      )
    }

    if (error instanceof Error && error.message.startsWith('Folder not empty: ')) {
      const folderPath = error.message.replace('Folder not empty: ', '')
      return mutationResponse(
        principal,
        {
          error: 'Folder not empty',
          path: folderPath,
        },
        { status: 409 },
      )
    }

    return mutationResponse(
      principal,
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
