import type { ParsedVaultNote } from './parse-note'

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
  folders: string[]
  tags: Map<string, string[]>
  warnings: string[]
  stats: VaultIndexStats
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
