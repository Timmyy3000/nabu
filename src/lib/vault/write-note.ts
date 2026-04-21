type StructuredNoteDocumentInput = {
  title?: string | null
  summary?: string | null
  tags?: unknown
  authors?: unknown
  source?: string | null
  references?: unknown
  body?: string | null
}

type StructuredNoteDocumentTimestamps = {
  createdAt?: string | null
  updatedAt?: string | null
}

export type VaultStructuredNoteDocument = {
  title: string
  summary: string | null
  tags: string[]
  authors: string[]
  source: string | null
  references: string[]
  createdAt: string | null
  updatedAt: string | null
  body: string
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
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

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function renderArrayField(key: string, values: string[]): string[] {
  if (!values.length) {
    return []
  }

  return [
    `${key}:`,
    ...values.map((value) => `  - ${yamlString(value)}`),
  ]
}

export function normalizeStructuredNoteDocument(
  input: StructuredNoteDocumentInput,
  timestamps: StructuredNoteDocumentTimestamps = {},
): VaultStructuredNoteDocument {
  const title = normalizeText(input.title)
  const body = typeof input.body === 'string' ? input.body.trim() : ''

  if (!title || !body) {
    throw new Error('Invalid structured note document')
  }

  return {
    title,
    summary: normalizeText(input.summary),
    tags: normalizeTags(input.tags),
    authors: normalizeStringList(input.authors),
    source: normalizeText(input.source),
    references: normalizeStringList(input.references),
    createdAt: normalizeText(timestamps.createdAt),
    updatedAt: normalizeText(timestamps.updatedAt),
    body,
  }
}

export function renderCanonicalMarkdown(document: VaultStructuredNoteDocument): string {
  const frontmatterLines = [
    `title: ${yamlString(document.title)}`,
    ...(document.summary ? [`summary: ${yamlString(document.summary)}`] : []),
    ...renderArrayField('tags', document.tags),
    ...renderArrayField('authors', document.authors),
    ...(document.source ? [`source: ${yamlString(document.source)}`] : []),
    ...renderArrayField('references', document.references),
    ...(document.createdAt ? [`createdAt: ${yamlString(document.createdAt)}`] : []),
    ...(document.updatedAt ? [`updatedAt: ${yamlString(document.updatedAt)}`] : []),
  ]

  if (!frontmatterLines.length) {
    return document.body
  }

  return ['---', ...frontmatterLines, '---', document.body].join('\n')
}
