import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { VaultNoteLink } from '../lib/vault/parse-note'
import type { VaultBrowseData, VaultFolderTreeNode, VaultSearchResponse } from '../lib/vault/service'

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

function toRenderedMarkdown(body: string, outgoingLinks: VaultNoteLink[]): string {
  let nextBody = body

  for (const link of outgoingLinks) {
    if (!link.resolved || !link.targetRelPath || !link.targetSlug) {
      continue
    }

    const replacement = `[${getResolvedLinkLabel(link)}](${buildNoteHref(link.targetRelPath, link.targetSlug)})`
    nextBody = nextBody.split(link.raw).join(replacement)
  }

  return nextBody
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
  const folderTitle = browse.folder.path || 'Root'
  const searchActive = search?.normalizedQuery ? true : false

  function renderTreeNode(node: VaultFolderTreeNode): ReactNode {
    return (
      <li key={node.path || 'root'}>
        <Link
          to="/"
          search={(prev) => ({ ...prev, folder: node.path, note: '', q: '', searchPath: '', searchTag: '' })}
          className={node.path === browse.folder.path ? 'is-active' : undefined}
        >
          {node.name || 'Root'} <span className="muted">({node.noteCount})</span>
        </Link>
        {node.children.length > 0 ? <ul>{node.children.map((child) => renderTreeNode(child))}</ul> : null}
      </li>
    )
  }

  return (
    <div className="vault-layout vault-workspace panel">
      <aside className="vault-pane vault-pane-nav vault-sidebar">
        <p className="eyebrow">Nabu</p>
        <p>
          <a href="/logout" className="logout-link">
            Logout
          </a>
        </p>
        <h1>Knowledge Vault</h1>
        <form method="get" action="/" className="search-form search-form-compact">
          <div className="search-field">
            <label htmlFor="vault-search-input">Search notes</label>
            <input id="vault-search-input" name="q" defaultValue={search?.query ?? ''} placeholder="Search vault..." />
          </div>
          <div className="search-field">
            <label htmlFor="vault-search-path">Scope path (optional)</label>
            <input
              id="vault-search-path"
              name="searchPath"
              defaultValue={searchPathInput}
              placeholder={browse.folder.path || 'whole vault'}
            />
          </div>
          <div className="search-field">
            <label htmlFor="vault-search-tag">Tag (optional)</label>
            <input id="vault-search-tag" name="searchTag" defaultValue={searchTagInput} placeholder="e.g. ai" />
          </div>
          <input type="hidden" name="folder" value={browse.folder.path} />
          <input type="hidden" name="note" value={browse.selectedNoteSlug ?? ''} />
          <p className="muted">Use quotes for exact phrases, e.g. "bind mount".</p>
          <div className="search-actions">
            <button type="submit">Search</button>
            {searchActive ? (
              <Link
                to="/"
                search={(prev) => ({
                  ...prev,
                  q: '',
                  searchPath: '',
                  searchTag: '',
                })}
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
        <ul className="tree-list">{renderTreeNode(browse.tree)}</ul>
      </aside>

      <section className="vault-pane vault-pane-list vault-list">
        {searchActive && search ? (
          <>
            <h2>Search</h2>
            <p className="muted">
              {search.total} result{search.total === 1 ? '' : 's'}
              {search.path ? ` in ${search.path}` : ''}
              {search.tag ? ` tagged ${search.tag}` : ''}
            </p>
            <ul className="note-list search-results">
              {search.results.map((result) => (
                <li key={result.id} className="note-row">
                  <Link
                    to="/"
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
                  <p className="muted">{result.relPath}</p>
                  <p>{result.snippet}</p>
                  <p className="muted">{result.reasons.join(', ')}</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2>{folderTitle}</h2>
            <p className="muted">{browse.folder.notes.length} notes</p>
            {browse.folder.notes.length > 0 ? (
              <ul className="note-list">
                {browse.folder.notes.map((note) => (
                  <li key={note.id} className="note-row">
                    <Link
                      to="/"
                      search={(prev) => ({
                        ...prev,
                        folder: browse.folder.path,
                        note: note.slug,
                      })}
                      className={note.slug === browse.selectedNoteSlug ? 'is-active' : undefined}
                    >
                      {note.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No notes in this folder yet.</p>
            )}
          </>
        )}
      </section>

      <article className="vault-pane vault-pane-note vault-note">
        {browse.note ? (
          <>
            <header className="note-head">
              <h2>{browse.note.title}</h2>
              <p className="muted note-meta">
                <button
                  type="button"
                  className="note-path-button"
                  aria-label="Copy note path"
                  title="Copy note path"
                  onClick={() => void navigator.clipboard?.writeText(browse.note!.relPath)}
                >
                  {browse.note.relPath}
                </button>
              </p>
            </header>
            <div className="note-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{toRenderedMarkdown(browse.note.body, browse.note.outgoingLinks)}</ReactMarkdown>
            </div>
          </>
        ) : (
          <>
            <h2>No note selected</h2>
            <p className="muted note-meta">Select a note from the list to start browsing.</p>
          </>
        )}
      </article>
    </div>
  )
}
