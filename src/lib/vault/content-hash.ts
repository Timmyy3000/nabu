import { createHash } from 'node:crypto'

export function hashVaultRawMarkdown(rawMarkdown: string): string {
  return createHash('sha256').update(rawMarkdown, 'utf8').digest('hex')
}

export function hashVaultNote(value: unknown): string {
  const note = typeof value === 'object' && value !== null && 'note' in value ? value.note : value
  const hashableNote =
    typeof note === 'object' && note !== null && !Array.isArray(note)
      ? Object.fromEntries(Object.entries(note).filter(([key]) => key !== 'revision'))
      : note
  return createHash('sha256').update(JSON.stringify(hashableNote) ?? 'null').digest('hex')
}
