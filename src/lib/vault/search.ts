import type { ParsedVaultNote } from './parse-note'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_SNIPPET_LENGTH = 160

type SearchReason =
  | 'slug-exact'
  | 'title-exact'
  | 'title-token'
  | 'tag-exact'
  | 'phrase'
  | 'summary-token'
  | 'body-token'
  | 'path-scope'

export type VaultSearchResult = {
  id: string
  relPath: string
  slug: string
  title: string
  summary: string | null
  tags: string[]
  score: number
  reasons: SearchReason[]
  snippet: string
}

export type VaultSearchResponse = {
  query: string
  normalizedQuery: string
  exactPhrases: string[]
  tokens: string[]
  path: string
  tag: string | null
  limit: number
  offset: number
  total: number
  hasMore: boolean
  results: VaultSearchResult[]
}

export type SearchVaultIndexInput = {
  notes: ParsedVaultNote[]
  query: string
  path: string
  tag: string | null
  limit: number
  offset: number
}

export function normalizeSearchQuery(query: string): {
  query: string
  normalizedQuery: string
  exactPhrases: string[]
  tokens: string[]
} {
  const cleanedQuery = query.trim()
  const hasBalancedQuotes = ((cleanedQuery.match(/"/g) ?? []).length & 1) === 0
  const exactPhrases: string[] = []

  let unquotedRemainder = cleanedQuery
  if (hasBalancedQuotes) {
    unquotedRemainder = cleanedQuery.replace(/"([^"]*)"/g, (_full, quoted: string) => {
      const normalizedPhrase = normalizeSearchText(quoted)
      if (normalizedPhrase) {
        exactPhrases.push(normalizedPhrase)
      }
      return ' '
    })
  }

  const normalizedQuery = normalizeSearchText(cleanedQuery.replace(/"/g, ' '))
  const tokens = normalizeSearchText(unquotedRemainder).split(' ').filter(Boolean)

  return {
    query: cleanedQuery,
    normalizedQuery,
    exactPhrases,
    tokens,
  }
}

export function normalizeSearchTag(tagInput: string | null | undefined): string | null {
  if (tagInput == null) {
    return null
  }

  const normalizedTag = normalizeSearchText(tagInput)
  return normalizedTag || null
}

export function normalizeSearchLimit(limitInput: number | null | undefined): number {
  if (!Number.isInteger(limitInput) || (limitInput ?? 0) <= 0) {
    return DEFAULT_LIMIT
  }

  return Math.min(limitInput ?? DEFAULT_LIMIT, MAX_LIMIT)
}

export function normalizeSearchOffset(offsetInput: number | null | undefined): number {
  if (!Number.isInteger(offsetInput) || (offsetInput ?? -1) < 0) {
    return 0
  }

  return offsetInput ?? 0
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function includesAllTokens(value: string, tokens: string[]): boolean {
  if (tokens.length === 0) {
    return false
  }

  return tokens.every((token) => value.includes(token))
}

function countTokenHits(value: string, tokens: string[]): number {
  if (!value || tokens.length === 0) {
    return 0
  }

  let hitCount = 0

  for (const token of tokens) {
    if (value.includes(token)) {
      hitCount += 1
    }
  }

  return hitCount
}

function isInPathScope(relPath: string, pathScope: string): boolean {
  return relPath.startsWith(`${pathScope}/`)
}

function pathScopeExists(notes: ParsedVaultNote[], pathScope: string): boolean {
  return notes.some((note) => isInPathScope(note.relPath, pathScope))
}

function truncateSnippet(source: string, startIndex: number): string {
  const safeSource = source.replace(/\s+/g, ' ').trim()
  if (!safeSource) {
    return ''
  }

  const maxLength = MAX_SNIPPET_LENGTH
  const desiredStart = Math.max(0, startIndex - Math.floor(maxLength * 0.35))
  const end = Math.min(safeSource.length, desiredStart + maxLength)
  const excerpt = safeSource.slice(desiredStart, end).trim()

  if (!excerpt) {
    return safeSource.slice(0, maxLength)
  }

  const hasPrefix = desiredStart > 0
  const hasSuffix = end < safeSource.length

  if (hasPrefix && hasSuffix) {
    return `... ${excerpt} ...`
  }

  if (hasPrefix) {
    return `... ${excerpt}`
  }

  if (hasSuffix) {
    return `${excerpt} ...`
  }

  return excerpt
}

function buildSnippet(
  note: ParsedVaultNote,
  normalizedQuery: string,
  tokens: string[],
  exactPhrases: string[],
): string {
  const summaryText = (note.summary ?? '').replace(/\s+/g, ' ').trim()
  const bodyText = note.body.replace(/\s+/g, ' ').trim()

  for (const phrase of exactPhrases) {
    const phraseRegex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const summaryPhraseMatch = summaryText.match(phraseRegex)
    if (summaryPhraseMatch && summaryPhraseMatch.index != null) {
      return truncateSnippet(summaryText, summaryPhraseMatch.index)
    }

    const bodyPhraseMatch = bodyText.match(phraseRegex)
    if (bodyPhraseMatch && bodyPhraseMatch.index != null) {
      return truncateSnippet(bodyText, bodyPhraseMatch.index)
    }
  }

  if (normalizedQuery) {
    const phraseRegex = new RegExp(normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const summaryPhraseMatch = summaryText.match(phraseRegex)
    if (summaryPhraseMatch && summaryPhraseMatch.index != null) {
      return truncateSnippet(summaryText, summaryPhraseMatch.index)
    }

    const bodyPhraseMatch = bodyText.match(phraseRegex)
    if (bodyPhraseMatch && bodyPhraseMatch.index != null) {
      return truncateSnippet(bodyText, bodyPhraseMatch.index)
    }
  }

  for (const token of tokens) {
    const tokenRegex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const summaryTokenMatch = summaryText.match(tokenRegex)
    if (summaryTokenMatch && summaryTokenMatch.index != null) {
      return truncateSnippet(summaryText, summaryTokenMatch.index)
    }

    const bodyTokenMatch = bodyText.match(tokenRegex)
    if (bodyTokenMatch && bodyTokenMatch.index != null) {
      return truncateSnippet(bodyText, bodyTokenMatch.index)
    }
  }

  if (summaryText) {
    return truncateSnippet(summaryText, 0)
  }

  return truncateSnippet(bodyText, 0)
}

function compareSearchResults(left: VaultSearchResult, right: VaultSearchResult): number {
  if (left.score !== right.score) {
    return right.score - left.score
  }

  if (left.relPath.length !== right.relPath.length) {
    return left.relPath.length - right.relPath.length
  }

  if (left.title.length !== right.title.length) {
    return left.title.length - right.title.length
  }

  return left.relPath.localeCompare(right.relPath)
}

function scoreNote(input: {
  note: ParsedVaultNote
  normalizedQuery: string
  exactPhrases: string[]
  tokens: string[]
  pathScope: string
  tag: string | null
}): VaultSearchResult | null {
  const { note, normalizedQuery, exactPhrases, tokens, pathScope, tag } = input

  const normalizedSlug = normalizeSearchText(note.slug)
  const normalizedTitle = normalizeSearchText(note.title)
  const normalizedSummary = normalizeSearchText(note.summary ?? '')
  const normalizedBody = normalizeSearchText(note.body)
  const normalizedTags = note.tags.map((tag) => normalizeSearchText(tag))

  if (tag && !normalizedTags.includes(tag)) {
    return null
  }

  if (exactPhrases.length > 0) {
    const phraseSources = [normalizedSlug, normalizedTitle, normalizedSummary, normalizedBody]
    const hasAllExactPhrases = exactPhrases.every((phrase) =>
      phraseSources.some((source) => source.includes(phrase)),
    )
    if (!hasAllExactPhrases) {
      return null
    }
  }

  let score = 0
  const reasons: SearchReason[] = []

  if (normalizedSlug === normalizedQuery) {
    score += 100
    reasons.push('slug-exact')
  }

  if (normalizedTitle === normalizedQuery) {
    score += 90
    reasons.push('title-exact')
  }

  if (includesAllTokens(normalizedTitle, tokens)) {
    score += 70
    reasons.push('title-token')
  }

  if (normalizedTags.includes(normalizedQuery)) {
    score += 60
    reasons.push('tag-exact')
  }

  const phraseMatchInSummaryOrBody =
    exactPhrases.length > 0
      ? exactPhrases.some((phrase) => normalizedSummary.includes(phrase) || normalizedBody.includes(phrase))
      : normalizedQuery.length > 0 &&
        (normalizedSummary.includes(normalizedQuery) || normalizedBody.includes(normalizedQuery))
  if (phraseMatchInSummaryOrBody) {
    score += 50
    reasons.push('phrase')
  }

  const hasAllBodyTokens = tokens.every(
    (token) => normalizedSummary.includes(token) || normalizedBody.includes(token),
  )
  if (tokens.length > 0 && hasAllBodyTokens) {
    score += 35
    if (!reasons.includes('body-token')) {
      reasons.push('body-token')
    }
  }

  const summaryTokenHits = countTokenHits(normalizedSummary, tokens)
  const summaryTokenScore = Math.min(summaryTokenHits * 8, 24)
  if (summaryTokenScore > 0) {
    score += summaryTokenScore
    reasons.push('summary-token')
  }

  const bodyTokenHits = countTokenHits(normalizedBody, tokens)
  const bodyTokenScore = Math.min(bodyTokenHits * 4, 20)
  if (bodyTokenScore > 0) {
    score += bodyTokenScore
    if (!reasons.includes('body-token')) {
      reasons.push('body-token')
    }
  }

  if (pathScope) {
    reasons.push('path-scope')
  }

  if (score <= 0) {
    return null
  }

  return {
    id: note.id,
    relPath: note.relPath,
    slug: note.slug,
    title: note.title,
    summary: note.summary,
    tags: note.tags,
    score,
    reasons,
    snippet: buildSnippet(note, normalizedQuery, tokens, exactPhrases),
  }
}

export function searchVaultIndex(input: SearchVaultIndexInput): VaultSearchResponse {
  const queryData = normalizeSearchQuery(input.query)
  const normalizedTag = normalizeSearchTag(input.tag)

  const scopedNotes = input.path
    ? pathScopeExists(input.notes, input.path)
      ? input.notes.filter((note) => isInPathScope(note.relPath, input.path))
      : []
    : input.notes

  const matched = scopedNotes
    .map((note) =>
      scoreNote({
        note,
        normalizedQuery: queryData.normalizedQuery,
        exactPhrases: queryData.exactPhrases,
        tokens: queryData.tokens,
        pathScope: input.path,
        tag: normalizedTag,
      }),
    )
    .filter((entry): entry is VaultSearchResult => entry !== null)
    .sort(compareSearchResults)

  const total = matched.length
  const pagedResults = matched.slice(input.offset, input.offset + input.limit)

  return {
    query: queryData.query,
    normalizedQuery: queryData.normalizedQuery,
    exactPhrases: queryData.exactPhrases,
    tokens: queryData.tokens,
    path: input.path,
    tag: normalizedTag,
    limit: input.limit,
    offset: input.offset,
    total,
    hasMore: input.offset + pagedResults.length < total,
    results: pagedResults,
  }
}
