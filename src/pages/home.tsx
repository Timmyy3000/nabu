import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { VaultNoteLink } from '../lib/vault/parse-note'
import type {
  VaultBacklink,
  VaultBrowseData,
  VaultFolderTreeNode,
  VaultNoteNeighborhood,
  VaultSearchResponse,
} from '../lib/vault/service'

function getParentFolderPath(relPath: string): string {
  const parts = relPath.split('/')
  if (parts.length <= 1) {
    return ''
  }

  return parts.slice(0, -1).join('/')
}

function buildNoteHref(relPath: string, slug: string): string {
  const params = new URLSearchParams({
    folder: getParentFolderPath(relPath),
    note: slug,
  })

  return `/?${params.toString()}`
}

function getResolvedLinkLabel(link: VaultNoteLink): string {
  if (link.text) {
    return link.text
  }

  const target = link.target.split('/').pop() ?? link.target
  return target.replace(/\.md$/i, '')
}

function stripLeadingHeading(body: string, title: string): string {
  const match = body.match(/^#\s+(.+?)\n+(.*)$/s)
  if (!match) {
    return body
  }

  const heading = match[1].trim().toLowerCase()
  if (heading !== title.trim().toLowerCase()) {
    return body
  }

  return match[2].trimStart()
}

function toRenderedMarkdown(body: string, outgoingLinks: VaultNoteLink[], title: string): string {
  let nextBody = stripLeadingHeading(body, title)

  for (const link of outgoingLinks) {
    if (!link.resolved || !link.targetRelPath || !link.targetSlug) {
      continue
    }

    const replacement = `[${getResolvedLinkLabel(link)}](${buildNoteHref(link.targetRelPath, link.targetSlug)})`
    nextBody = nextBody.split(link.raw).join(replacement)
  }

  return nextBody
}

function formatDate(value: string | null): string | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}

function estimateReadTime(text: string): string {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.max(1, Math.round(wordCount / 200))
  return `${minutes} min`
}

function formatReason(reason: string): string {
  return reason.replace(/-/g, ' ')
}

function buildTagSearchState(folderPath: string, selectedNoteSlug: string | null, tag: string) {
  return {
    folder: folderPath,
    note: selectedNoteSlug ?? '',
    q: '',
    searchPath: folderPath,
    searchTag: tag,
  }
}

function renderTagChip(tag: string, browse: VaultBrowseData, activeTag: string, key: string) {
  const isActive = activeTag === tag

  return (
    <Link
      key={key}
      to="/"
      search={() => buildTagSearchState(browse.folder.path, browse.selectedNoteSlug, tag)}
      className={isActive ? 'tag-chip is-active' : 'tag-chip'}
    >
      #{tag}
    </Link>
  )
}

function buildMetadataRows(browse: VaultBrowseData) {
  const note = browse.note
  if (!note) {
    return [] as Array<{ key: string; label: string; value: string }>
  }

  const rows = [
    { key: 'path', label: 'path', value: note.relPath },
    { key: 'slug', label: 'slug', value: note.slug },
  ]

  if (note.authors.length > 0) {
    rows.push({ key: 'authors', label: 'authors', value: note.authors.join(', ') })
  }

  if (note.source) {
    rows.push({ key: 'source', label: 'source', value: note.source })
  }

  if (note.createdAt) {
    rows.push({ key: 'createdAt', label: 'created', value: formatDate(note.createdAt) ?? note.createdAt })
  }

  if (note.updatedAt) {
    rows.push({ key: 'updatedAt', label: 'updated', value: formatDate(note.updatedAt) ?? note.updatedAt })
  }

  for (const [frontmatterKey, frontmatterValue] of Object.entries(note.frontmatter)) {
    rows.push({
      key: `frontmatter-${frontmatterKey}`,
      label: frontmatterKey,
      value: Array.isArray(frontmatterValue) ? frontmatterValue.join(', ') : String(frontmatterValue),
    })
  }

  return rows
}

function breadcrumbSegments(relPath: string) {
  const parts = relPath.split('/').filter(Boolean)
  return ['vault', ...parts]
}

function BacklinkList({ links }: { links: VaultBacklink[] }) {
  if (links.length === 0) {
    return <p className="empty-copy">none</p>
  }

  return (
    <ul className="drawer-list">
      {links.map((link) => (
        <li key={`${link.sourceRelPath}:${link.raw}`}>
          <Link to="/" search={() => ({ folder: getParentFolderPath(link.sourceRelPath), note: link.sourceSlug, q: '', searchPath: '', searchTag: '' })}>
            {link.sourceTitle}
          </Link>
          <p className="meta-inline">{link.sourceRelPath}</p>
        </li>
      ))}
    </ul>
  )
}

function DetailsDrawer({
  browse,
  neighborhood,
  open,
}: {
  browse: VaultBrowseData
  neighborhood: VaultNoteNeighborhood | null
  open: boolean
}) {
  if (!browse.note) {
    return null
  }

  const metadataRows = buildMetadataRows(browse)

  return (
    <aside className={open ? 'details-drawer is-open' : 'details-drawer'} aria-hidden={!open}>
      <section className="drawer-section">
        <p className="section-label">metadata</p>
        <dl className="metadata-grid">
          {metadataRows.map((row) => (
            <div key={row.key} className="metadata-row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="drawer-section">
        <p className="section-label">neighborhood</p>
        <div className="stat-grid">
          <div className="stat-tile">
            <strong>{neighborhood?.stats.outgoingResolvedCount ?? browse.note.outgoingLinks.length}</strong>
            <span>outgoing</span>
          </div>
          <div className="stat-tile">
            <strong>{neighborhood?.stats.backlinkCount ?? browse.note.backlinks.length}</strong>
            <span>backlinks</span>
          </div>
          <div className="stat-tile">
            <strong>{neighborhood?.stats.unresolvedOutgoingCount ?? 0}</strong>
            <span>unresolved</span>
          </div>
        </div>
      </section>

      <section className="drawer-section">
        <p className="section-label">linked from</p>
        <BacklinkList links={neighborhood?.backlinks ?? browse.note.backlinks} />
      </section>

      <section className="drawer-section">
        <p className="section-label">outgoing</p>
        <ul className="drawer-list">
          {(neighborhood?.outgoing ?? []).map((link) => (
            <li key={`${link.targetRelPath}:${link.raw}`}>
              <Link to="/" search={() => ({ folder: getParentFolderPath(link.targetRelPath), note: link.targetSlug, q: '', searchPath: '', searchTag: '' })}>
                {link.text ?? link.targetSlug}
              </Link>
              <p className="meta-inline">{link.targetRelPath}</p>
            </li>
          ))}
          {!neighborhood?.outgoing.length ? <li className="empty-copy">none</li> : null}
        </ul>
      </section>

      <section className="drawer-section">
        <p className="section-label">related</p>
        <ul className="drawer-list">
          {(neighborhood?.relatedNotes ?? []).map((note) => (
            <li key={note.relPath}>
              <Link to="/" search={() => ({ folder: getParentFolderPath(note.relPath), note: note.slug, q: '', searchPath: '', searchTag: '' })}>
                {note.title}
              </Link>
              <p className="meta-inline">
                {note.connectionCount} · {note.reasons.map(formatReason).join(', ')}
              </p>
            </li>
          ))}
          {!neighborhood?.relatedNotes.length ? <li className="empty-copy">none</li> : null}
        </ul>
      </section>

      <section className="drawer-section">
        <p className="section-label">references</p>
        <ul className="drawer-list">
          {browse.note.references.map((reference) => (
            <li key={reference}>
              <code>{reference}</code>
            </li>
          ))}
          {browse.note.references.length === 0 ? <li className="empty-copy">none</li> : null}
        </ul>
      </section>
    </aside>
  )
}

export function HomePage({
  browse,
  search,
  searchPathInput,
  searchTagInput,
}: {
  browse: VaultBrowseData
  search: VaultSearchResponse | null
  searchPathInput: string
  searchTagInput: string
}) {
  const folderTitle = browse.folder.path || 'root'
  const searchActive = search?.normalizedQuery ? true : false
  const [detailsOpenFor, setDetailsOpenFor] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  const renderedMarkdown = useMemo(() => {
    if (!browse.note) {
      return ''
    }

    return toRenderedMarkdown(browse.note.body, browse.note.outgoingLinks, browse.note.title)
  }, [browse.note])

  const activeTag = search?.tag ?? searchTagInput
  const detailsOpen = browse.note ? detailsOpenFor === browse.note.relPath : false
  const noteDate = formatDate(browse.note?.updatedAt ?? browse.note?.createdAt ?? null)
  const noteReadTime = browse.note ? estimateReadTime(browse.note.body) : null

  function renderTreeNode(node: VaultFolderTreeNode, depth = 0): ReactNode {
    const isRoot = node.path === ''

    return (
      <li key={node.path || 'root'}>
        <Link
          to="/"
          search={() => ({ ...buildTagSearchState(node.path, '', ''), q: '', searchPath: '', searchTag: '' })}
          className={node.path === browse.folder.path ? 'tree-row is-active' : 'tree-row'}
          style={{ paddingLeft: `${6 + depth * 14}px` }}
        >
          <span className="tree-caret">▸</span>
          <span className="tree-name">{isRoot ? 'root' : node.name}</span>
          <span className="tree-count">{node.noteCount}</span>
        </Link>
        {node.children.length > 0 ? <ul className="tree-children">{node.children.map((child) => renderTreeNode(child, depth + 1))}</ul> : null}
      </li>
    )
  }

  return (
    <div className="vault-shell">
      <aside className="vault-pane vault-spine">
        <header className="spine-header">
          <div className="wordmark" aria-label="𒀭 nabu">
            <span className="wedge">𒀭</span>
            <span className="wordmark-text">nabu</span>
          </div>
          <a href="/logout" className="spine-logout">
            logout
          </a>
        </header>

        <div className="spine-scope">
          <span className="scope-key">scope</span>
          <span className="scope-val">/{browse.folder.path || ''}</span>
        </div>

        <form method="get" action="/" className="spine-search">
          <label htmlFor="vault-search-input" className="sr-only">
            search vault
          </label>
          <div className="search-input-wrap">
            <span className="search-prefix">⌕</span>
            <input
              ref={searchInputRef}
              id="vault-search-input"
              name="q"
              defaultValue={search?.query ?? ''}
              placeholder="search vault"
              className="search-input"
            />
          </div>

          <div className="search-filters">
            <div className="filter-field">
              <label htmlFor="vault-search-path">scope path</label>
              <input id="vault-search-path" name="searchPath" defaultValue={searchPathInput} placeholder={browse.folder.path || 'whole vault'} />
            </div>
            <div className="filter-field">
              <label htmlFor="vault-search-tag">tag filter</label>
              <input id="vault-search-tag" name="searchTag" defaultValue={searchTagInput} placeholder="ai" />
            </div>
          </div>

          <input type="hidden" name="folder" value={browse.folder.path} />
          <input type="hidden" name="note" value={browse.selectedNoteSlug ?? ''} />

          <div className="search-actions">
            <button type="submit" className="ui-button">
              search
            </button>
            {searchActive ? (
              <Link
                to="/"
                className="text-button"
                search={(prev) => ({
                  ...prev,
                  q: '',
                  searchPath: '',
                  searchTag: '',
                })}
              >
                clear
              </Link>
            ) : null}
          </div>
        </form>

        <section className="spine-section">
          <p className="section-label">tree</p>
          <ul className="tree-list">{renderTreeNode(browse.tree)}</ul>
        </section>
      </aside>

      <section className="vault-pane vault-notes-column">
        <header className="notes-header">
          <h2>{searchActive ? 'search' : folderTitle}</h2>
          <p className="notes-count">
            {searchActive && search
              ? `${search.total} result${search.total === 1 ? '' : 's'}`
              : `${browse.folder.notes.length} note${browse.folder.notes.length === 1 ? '' : 's'}`}
          </p>
        </header>

        {searchActive && search ? (
          <ul className="note-list search-results">
            {search.results.map((result) => (
              <li key={result.id} className="note-card search-card">
                <Link
                  to="/"
                  className="note-card-title"
                  search={(prev) => ({
                    ...prev,
                    folder: getParentFolderPath(result.relPath),
                    note: result.slug,
                    q: '',
                    searchPath: '',
                    searchTag: '',
                  })}
                >
                  {result.title}
                </Link>
                <p className="note-card-meta">{result.relPath}</p>
                <p className="note-card-summary">{result.snippet}</p>
                <div className="tag-row">
                  {result.tags.map((tag) => renderTagChip(tag, browse, activeTag, `${result.id}:${tag}`))}
                </div>
                <p className="note-card-meta">{result.reasons.join(', ')}</p>
              </li>
            ))}
          </ul>
        ) : browse.folder.notes.length > 0 ? (
          <ul className="note-list">
            {browse.folder.notes.map((note) => (
              <li key={note.id} className={note.slug === browse.selectedNoteSlug ? 'note-card is-active' : 'note-card'}>
                <Link
                  to="/"
                  className="note-card-title"
                  search={(prev) => ({
                    ...prev,
                    folder: browse.folder.path,
                    note: note.slug,
                  })}
                >
                  {note.title}
                </Link>
                <p className="note-card-meta">
                  {formatDate(note.updatedAt ?? note.createdAt) ?? 'undated'} · {estimateReadTime(note.summary ?? note.title)}
                </p>
                {note.summary ? <p className="note-card-summary">{note.summary}</p> : null}
                <div className="tag-row">
                  {note.tags.map((tag) => renderTagChip(tag, browse, activeTag, `${note.id}:${tag}`))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-copy">No notes in this folder yet.</p>
        )}
      </section>

      <article className="vault-pane vault-reader">
        {browse.note ? (
          <>
            <header className="reader-topbar">
              <nav aria-label="breadcrumbs" className="breadcrumbs">
                {breadcrumbSegments(browse.note.relPath).map((segment, index, parts) => (
                  <span key={`${segment}-${index}`} className={index === parts.length - 1 ? 'breadcrumb-leaf' : undefined}>
                    {segment}
                    {index < parts.length - 1 ? ' / ' : ''}
                  </span>
                ))}
              </nav>
              <button
                type="button"
                className={detailsOpen ? 'details-button is-active' : 'details-button'}
                onClick={() => setDetailsOpenFor((current) => (current === browse.note!.relPath ? null : browse.note!.relPath))}
              >
                (i) details
              </button>
            </header>

            <div className="reader-layout">
              <div className="reader-article">
                <header className="reader-header">
                  <h1>{browse.note.title}</h1>
                  <p className="reader-meta">
                    {[browse.note.authors.join(', '), noteDate, noteReadTime].filter(Boolean).join(' · ')}
                  </p>
                  <div className="tag-row">
                    {browse.note.tags.map((tag) => renderTagChip(tag, browse, activeTag, `reader:${tag}`))}
                  </div>
                  {browse.note.summary ? <div className="tldr-card">{browse.note.summary}</div> : null}
                </header>

                <div className="reader-actions">
                  <button
                    type="button"
                    className="path-button"
                    aria-label="Copy note path"
                    title="Copy note path"
                    onClick={() => void navigator.clipboard?.writeText(browse.note!.relPath)}
                  >
                    {browse.note.relPath}
                  </button>
                </div>

                <div className="note-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{renderedMarkdown}</ReactMarkdown>
                </div>
              </div>

              <DetailsDrawer browse={browse} neighborhood={browse.noteNeighborhood} open={detailsOpen} />
            </div>
          </>
        ) : (
          <div className="reader-empty">
            <h2>No note selected</h2>
            <p className="empty-copy">Select a note from the list to start browsing.</p>
          </div>
        )}
      </article>
    </div>
  )
}
