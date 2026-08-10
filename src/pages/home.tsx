import { Link, useBlocker, useNavigate, useRouter } from '@tanstack/react-router'
import type { FormEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
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

function withShareToken<T extends Record<string, unknown>>(search: T, shareToken = ''): T & { token?: string } {
  return shareToken ? { ...search, token: shareToken } : search
}

function buildNoteHref(relPath: string, slug: string, shareToken = ''): string {
  const params = new URLSearchParams({
    folder: getParentFolderPath(relPath),
    note: slug,
  })
  if (shareToken) {
    params.set('token', shareToken)
  }

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

function rewriteWikiEmbeds(body: string): string {
  return body.replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alt: string | undefined) => {
    const label = (alt ?? target).trim()
    return `![${label}](<${target.trim()}>)`
  })
}

function toRenderedMarkdown(body: string, outgoingLinks: VaultNoteLink[], title: string, shareToken = ''): string {
  let nextBody = rewriteWikiEmbeds(stripLeadingHeading(body, title))

  for (const link of outgoingLinks) {
    if (link.inaccessible || !link.resolved || !link.targetRelPath || !link.targetSlug) {
      continue
    }

    const replacement = `[${getResolvedLinkLabel(link)}](${buildNoteHref(link.targetRelPath, link.targetSlug, shareToken)})`
    nextBody = nextBody.split(link.raw).join(replacement)
  }

  return nextBody
}

function resolveRelativeVaultPath(noteRelPath: string, target: string): string | null {
  const trimmed = target.trim()
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null
  }

  const pathOnly = (trimmed.split('#')[0] ?? trimmed).split('?')[0] ?? trimmed
  const sourceParts = noteRelPath.split('/').filter(Boolean).slice(0, -1)
  const targetParts = (pathOnly.startsWith('/') ? pathOnly.slice(1) : [...sourceParts, pathOnly].join('/')).split('/')
  const normalized: string[] = []

  for (const segment of targetParts) {
    if (!segment || segment === '.') {
      continue
    }
    if (segment === '..') {
      if (normalized.length === 0) {
        return null
      }
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }

  return normalized.length > 0 ? normalized.join('/') : null
}

function buildAssetHref(noteRelPath: string, target: string, shareToken = ''): string | null {
  const relPath = resolveRelativeVaultPath(noteRelPath, target)
  if (!relPath) {
    return null
  }

  const params = new URLSearchParams({ path: relPath })
  if (shareToken) {
    params.set('token', shareToken)
  }
  return `/api/vault/assets?${params.toString()}`
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

type EditorSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

function editorStatusLabel(state: EditorSaveState, dirty: boolean): string {
  if (state === 'saving') {
    return 'saving…'
  }

  if (state === 'saved') {
    return 'saved'
  }

  if (state === 'conflict') {
    return 'conflict'
  }

  if (state === 'error') {
    return 'save failed'
  }

  return dirty ? 'unsaved' : 'saved'
}

function buildTagSearchState(folderPath: string, selectedNoteSlug: string | null, tag: string, shareToken = '') {
  return withShareToken({
    folder: folderPath,
    note: selectedNoteSlug ?? '',
    q: '',
    searchPath: folderPath,
    searchTag: tag,
  }, shareToken)
}

function renderTagChip(tag: string, browse: VaultBrowseData, activeTag: string, key: string, shareToken = '') {
  const isActive = activeTag === tag

  return (
    <Link
      key={key}
      to="/"
      search={() => buildTagSearchState(browse.folder.path, browse.selectedNoteSlug, tag, shareToken)}
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

  const hiddenKeys = new Set(['title', 'slug', 'authors', 'author', 'source', 'createdAt', 'updatedAt', 'summary', 'references', 'tags'])

  for (const [frontmatterKey, frontmatterValue] of Object.entries(note.frontmatter)) {
    if (hiddenKeys.has(frontmatterKey)) {
      continue
    }

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

function getOutgoingLinkLabel(link: VaultNoteNeighborhood['outgoing'][number]): string {
  return link.text || link.targetTitle || link.targetSlug
}

function BacklinkList({ links, shareToken = '' }: { links: VaultBacklink[]; shareToken?: string }) {
  if (links.length === 0) {
    return <p className="empty-copy">none</p>
  }

  return (
    <ul className="drawer-list">
      {links.map((link) => (
        <li key={`${link.sourceRelPath}:${link.raw}`}>
          <Link
            to="/"
            search={() => withShareToken({ folder: getParentFolderPath(link.sourceRelPath), note: link.sourceSlug, q: '', searchPath: '', searchTag: '' }, shareToken)}
          >
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
  shareToken = '',
}: {
  browse: VaultBrowseData
  neighborhood: VaultNoteNeighborhood | null
  open: boolean
  shareToken?: string
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
            <span>resolved outgoing</span>
          </div>
          <div className="stat-tile">
            <strong>{neighborhood?.stats.backlinkCount ?? browse.note.backlinks.length}</strong>
            <span>backlinks</span>
          </div>
          <div className="stat-tile">
            <strong>{neighborhood?.stats.unresolvedOutgoingCount ?? 0}</strong>
            <span>unresolved links</span>
          </div>
        </div>
      </section>

      <section className="drawer-section">
        <p className="section-label">linked from</p>
        <BacklinkList links={neighborhood?.backlinks ?? browse.note.backlinks} shareToken={shareToken} />
      </section>

      <section className="drawer-section">
        <p className="section-label">outgoing</p>
        <ul className="drawer-list">
          {(neighborhood?.outgoing ?? []).map((link) => (
            <li key={`${link.targetRelPath}:${link.raw}`}>
              <Link
                to="/"
                search={() => withShareToken({ folder: getParentFolderPath(link.targetRelPath), note: link.targetSlug, q: '', searchPath: '', searchTag: '' }, shareToken)}
              >
                {getOutgoingLinkLabel(link)}
              </Link>
              <p className="meta-inline">{link.targetRelPath}</p>
            </li>
          ))}
          {!neighborhood?.outgoing.length ? <li className="empty-copy">none</li> : null}
        </ul>
      </section>

      {neighborhood?.unresolvedOutgoing.length ? (
        <section className="drawer-section">
          <p className="section-label">unresolved links</p>
          <p className="drawer-note">Links found in the note body that do not currently resolve to another note in the vault.</p>
          <ul className="drawer-list">
            {neighborhood.unresolvedOutgoing.map((link) => (
              <li key={`${link.kind}:${link.raw}`}>
                {link.inaccessible ? <span className="inaccessible-link">{link.text ?? 'Non-accessible link'}</span> : <code>{link.raw}</code>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="drawer-section">
        <p className="section-label">related</p>
        <ul className="drawer-list">
          {(neighborhood?.relatedNotes ?? []).map((note) => (
            <li key={note.relPath}>
              <Link
                to="/"
                search={() => withShareToken({ folder: getParentFolderPath(note.relPath), note: note.slug, q: '', searchPath: '', searchTag: '' }, shareToken)}
              >
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
  shareToken = '',
}: {
  browse: VaultBrowseData
  search: VaultSearchResponse | null
  searchPathInput: string
  searchTagInput: string
  shareToken?: string
}) {
  const folderTitle = browse.folder.path || 'root'
  const searchActive = search?.normalizedQuery ? true : false
  const readOnly = Boolean(shareToken)
  const router = useRouter()
  const navigate = useNavigate()
  const [detailsOpenFor, setDetailsOpenFor] = useState<string | null>(null)
  const [editingNotePath, setEditingNotePath] = useState<string | null>(null)
  const [editorValue, setEditorValue] = useState('')
  const [editorBaseValue, setEditorBaseValue] = useState('')
  const [editorRevision, setEditorRevision] = useState('')
  const [editorSaveState, setEditorSaveState] = useState<EditorSaveState>('idle')
  const [editorError, setEditorError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)

  const editing = !readOnly && browse.note ? editingNotePath === browse.note.relPath : false
  const editorDirty = editing ? editorValue !== editorBaseValue : false

  const exitEditing = useCallback(() => {
    if (editorDirty && !window.confirm('Discard unsaved changes?')) {
      return
    }

    setEditingNotePath(null)
    setEditorValue('')
    setEditorBaseValue('')
    setEditorRevision('')
    setEditorSaveState('idle')
    setEditorError(null)
  }, [editorDirty])

  const saveEditor = useCallback(async () => {
    const note = browse.note
    if (!note || !editing || editorSaveState === 'saving' || !editorDirty) {
      return
    }

    setEditorSaveState('saving')
    setEditorError(null)

    try {
      const response = await fetch('/api/vault/notes/by-path', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          path: note.relPath,
          rawMarkdown: editorValue,
          expectedRawContentHash: editorRevision,
        }),
      })
      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        const conflict = response.status === 409
        setEditorSaveState(conflict ? 'conflict' : 'error')
        setEditorError(payload?.error ?? 'Unable to save note')
        return
      }

      setEditorBaseValue(editorValue)
      setEditorSaveState('saved')
      await router.invalidate()
      setEditingNotePath(null)
      setEditorValue('')
      setEditorBaseValue('')
      setEditorRevision('')
    } catch {
      setEditorSaveState('error')
      setEditorError('Unable to save note')
    }
  }, [browse.note, editorDirty, editorRevision, editorSaveState, editorValue, editing, router])

  useBlocker({
    shouldBlockFn: () => !window.confirm('Discard unsaved changes?'),
    enableBeforeUnload: false,
    disabled: !editorDirty,
  })

  const reloadLatestNote = useCallback(async () => {
    const note = browse.note
    if (!note) {
      return
    }

    try {
      const response = await fetch(`/api/vault/notes/by-path?path=${encodeURIComponent(note.relPath)}`)
      const payload = (await response.json().catch(() => null)) as { note?: { rawMarkdown: string; rawContentHash: string }; error?: string } | null

      if (!response.ok || !payload?.note) {
        setEditorSaveState('error')
        setEditorError(payload?.error ?? 'Unable to reload note')
        return
      }

      setEditorValue(payload.note.rawMarkdown)
      setEditorBaseValue(payload.note.rawMarkdown)
      setEditorRevision(payload.note.rawContentHash)
      setEditorSaveState('idle')
      setEditorError(null)
    } catch {
      setEditorSaveState('error')
      setEditorError('Unable to reload note')
    }
  }, [browse.note])

  function enterEditing() {
    if (!browse.note) {
      return
    }

    setEditingNotePath(browse.note.relPath)
    setEditorValue(browse.note.rawMarkdown)
    setEditorBaseValue(browse.note.rawMarkdown)
    setEditorRevision(browse.note.rawContentHash)
    setEditorSaveState('idle')
    setEditorError(null)
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)
    const getValue = (name: string) => {
      const value = formData.get(name)
      return typeof value === 'string' ? value : ''
    }

    void navigate({
      to: '/',
        search: {
          folder: getValue('folder'),
          note: getValue('note'),
          q: getValue('q'),
          searchPath: getValue('searchPath'),
          searchTag: getValue('searchTag'),
          ...(shareToken ? { token: shareToken } : {}),
        },
    })
  }

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

  useEffect(() => {
    if (editing) {
      editorRef.current?.focus()
    }
  }, [editing])

  useEffect(() => {
    if (!editorDirty) {
      return
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [editorDirty])

  useEffect(() => {
    function handleEditorKeydown(event: KeyboardEvent) {
      if (!editing) {
        return
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveEditor()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        exitEditing()
      }
    }

    window.addEventListener('keydown', handleEditorKeydown)
    return () => window.removeEventListener('keydown', handleEditorKeydown)
  }, [editing, exitEditing, saveEditor])

  const renderedMarkdown = useMemo(() => {
    if (!browse.note) {
      return ''
    }

    return toRenderedMarkdown(browse.note.body, browse.note.outgoingLinks, browse.note.title, shareToken)
  }, [browse.note, shareToken])

  const markdownComponents = useMemo<Components>(() => ({
    a: ({ node, children, href, ...props }) => {
      void node
      if (href?.startsWith('#nabu-inaccessible')) {
        return <span className="inaccessible-link">Non-accessible link</span>
      }

      return <a {...props} href={href}>{children}</a>
    },
    img: ({ node, alt, src, ...props }) => {
      void node
      const assetHref = src ? buildAssetHref(browse.note?.relPath ?? '', src, shareToken) : null
      if (shareToken && src && !assetHref) {
        return <span className="inaccessible-link">{alt || 'Non-accessible image'}</span>
      }

      return <img {...props} src={assetHref ?? src} alt={alt ?? ''} loading="lazy" />
    },
  }), [browse.note?.relPath, shareToken])

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
          search={() => withShareToken({ ...buildTagSearchState(node.path, '', ''), q: '', searchPath: '', searchTag: '' }, shareToken)}
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
          <div className="spine-header-actions">
            {!readOnly ? <Link to="/settings/agents" className="spine-settings-link">settings</Link> : null}
            <a href="/logout" className="spine-logout">
              {readOnly ? 'read-only share' : 'logout'}
            </a>
          </div>
        </header>

        <div className="spine-scope">
          <span className="scope-key">scope</span>
          <span className="scope-val">/{browse.folder.path || ''}</span>
        </div>

        {readOnly ? (
          <div className="shared-read-only-banner" role="status">
            read-only shared space
          </div>
        ) : null}

        <form method="get" action="/" className="spine-search" onSubmit={handleSearchSubmit}>
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
          {shareToken ? <input type="hidden" name="token" value={shareToken} /> : null}

          <div className="search-actions">
            <button type="submit" className="ui-button">
              search
            </button>
            {searchActive ? (
              <Link
                to="/"
                className="text-button"
                search={() => withShareToken({
                  folder: browse.folder.path,
                  note: browse.selectedNoteSlug ?? '',
                  q: '',
                  searchPath: '',
                  searchTag: '',
                }, shareToken)}
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
                  search={() => withShareToken({
                    folder: getParentFolderPath(result.relPath),
                    note: result.slug,
                    q: '',
                    searchPath: '',
                    searchTag: '',
                  }, shareToken)}
                >
                  {result.title}
                </Link>
                <p className="note-card-meta">{result.relPath}</p>
                <p className="note-card-summary">{result.snippet}</p>
                <div className="tag-row">
                  {result.tags.map((tag) => renderTagChip(tag, browse, activeTag, `${result.id}:${tag}`, shareToken))}
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
                  search={() => withShareToken({
                    folder: browse.folder.path,
                    note: note.slug,
                    q: '',
                    searchPath: '',
                    searchTag: '',
                  }, shareToken)}
                >
                  {note.title}
                </Link>
                <p className="note-card-meta">
                  {formatDate(note.updatedAt ?? note.createdAt) ?? 'undated'} · {estimateReadTime(note.summary ?? note.title)}
                </p>
                {note.summary ? <p className="note-card-summary">{note.summary}</p> : null}
                <div className="tag-row">
                  {note.tags.map((tag) => renderTagChip(tag, browse, activeTag, `${note.id}:${tag}`, shareToken))}
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
                    {browse.note.tags.map((tag) => renderTagChip(tag, browse, activeTag, `reader:${tag}`, shareToken))}
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
                  {!editing && !readOnly ? (
                    <button type="button" className="ui-button" aria-label="Edit note" onClick={enterEditing}>
                      edit
                    </button>
                  ) : null}
                </div>

                {editing ? (
                  <section className="note-editor" aria-label="Markdown editor">
                    <div className="editor-toolbar">
                      <span className="editor-mode-label">source</span>
                      <span className={editorSaveState === 'conflict' || editorSaveState === 'error' ? 'editor-status is-error' : 'editor-status'} aria-live="polite">
                        {editorStatusLabel(editorSaveState, editorDirty)}
                      </span>
                      <button type="button" className="text-button" onClick={exitEditing}>
                        cancel
                      </button>
                      <button type="button" className="ui-button" onClick={() => void saveEditor()} disabled={editorSaveState === 'saving' || !editorDirty}>
                        save
                      </button>
                    </div>
                    <label htmlFor="note-markdown-editor" className="sr-only">
                      Markdown editor
                    </label>
                    <textarea
                      ref={editorRef}
                      id="note-markdown-editor"
                      className="markdown-editor"
                      value={editorValue}
                      onChange={(event) => {
                        setEditorValue(event.target.value)
                        if (editorSaveState !== 'saving') {
                          setEditorSaveState('idle')
                          setEditorError(null)
                        }
                      }}
                      spellCheck={false}
                    />
                    {editorError ? (
                      <div className="editor-error" role="alert">
                        <p>{editorError}</p>
                        {editorSaveState === 'conflict' ? (
                          <button type="button" className="text-button" onClick={() => void reloadLatestNote()}>
                            reload latest
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </section>
                ) : (
                  <div className="note-markdown">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{renderedMarkdown}</ReactMarkdown>
                  </div>
                )}
              </div>

              {!editing ? <DetailsDrawer browse={browse} neighborhood={browse.noteNeighborhood} open={detailsOpen} shareToken={shareToken} /> : null}
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
