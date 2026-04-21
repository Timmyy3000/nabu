import type { ParsedVaultNote } from './parse-note'
import type { VaultNoteLink } from './parse-note'

export type VaultIndexStats = {
  noteCount: number
  folderCount: number
  tagCount: number
  collisionCount: number
  warningCount: number
}

export type VaultIndex = {
  notes: ParsedVaultNote[]
  byRelPath: Map<string, ParsedVaultNote>
  bySlug: Map<string, ParsedVaultNote>
  slugCollisions: Map<string, string[]>
  backlinksByTargetRelPath: Map<string, VaultBacklink[]>
  resolvedOutgoingBySourceRelPath: Map<string, VaultResolvedOutgoingLink[]>
  unresolvedOutgoingBySourceRelPath: Map<string, VaultNoteLink[]>
  folders: string[]
  tags: Map<string, string[]>
  warnings: string[]
  stats: VaultIndexStats
}

export type VaultBacklink = {
  sourceRelPath: string
  sourceSlug: string
  sourceTitle: string
  kind: 'wiki' | 'markdown'
  text: string | null
  raw: string
}

export type VaultResolvedOutgoingLink = {
  raw: string
  kind: 'wiki' | 'markdown'
  text: string | null
  target: string
  targetRelPath: string
  targetSlug: string
  targetTitle: string
}

export type VaultRelatedReason = 'outgoing' | 'backlink' | 'shared-folder'

export type VaultRelatedNote = {
  relPath: string
  slug: string
  title: string
  connectionCount: number
  reasons: VaultRelatedReason[]
}

export type VaultNoteNeighborhood = {
  note: {
    relPath: string
    slug: string
    title: string
  }
  outgoing: VaultResolvedOutgoingLink[]
  backlinks: VaultBacklink[]
  unresolvedOutgoing: VaultNoteLink[]
  relatedNotes: VaultRelatedNote[]
  stats: {
    outgoingResolvedCount: number
    backlinkCount: number
    unresolvedOutgoingCount: number
  }
}

export type VaultFolderTreeNode = {
  path: string
  name: string
  directNoteCount: number
  noteCount: number
  children: VaultFolderTreeNode[]
}

export type VaultFolderListItem = {
  path: string
  name: string
  directNoteCount: number
  noteCount: number
}
