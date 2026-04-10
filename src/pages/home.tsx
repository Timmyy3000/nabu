import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { VaultBrowseData, VaultFolderTreeNode } from '../lib/vault/service'

export function HomePage({ browse }: { browse: VaultBrowseData }) {
  const folderTitle = browse.folder.path || 'Root'

  function renderTreeNode(node: VaultFolderTreeNode): ReactNode {
    return (
      <li key={node.path || 'root'}>
        <Link
          to="/"
          search={(prev) => ({ ...prev, folder: node.path, note: '' })}
          className={node.path === browse.folder.path ? 'is-active' : undefined}
        >
          {node.name || 'Root'} <span className="muted">({node.noteCount})</span>
        </Link>
        {node.children.length > 0 ? <ul>{node.children.map((child) => renderTreeNode(child))}</ul> : null}
      </li>
    )
  }

  return (
    <div className="vault-layout">
      <aside className="vault-sidebar panel">
        <p className="eyebrow">Nabu</p>
        <h1>Knowledge Vault</h1>
        <ul className="tree-list">{renderTreeNode(browse.tree)}</ul>
      </aside>

      <section className="vault-list panel">
        <h2>{folderTitle}</h2>
        <p className="muted">{browse.folder.notes.length} notes</p>
        <ul className="note-list">
          {browse.folder.notes.map((note) => (
            <li key={note.id}>
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
      </section>

      <article className="vault-note panel">
        {browse.note ? (
          <>
            <h2>{browse.note.title}</h2>
            <p className="muted">{browse.note.relPath}</p>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{browse.note.body}</ReactMarkdown>
          </>
        ) : (
          <>
            <h2>No note selected</h2>
            <p className="muted">Select a note from the list to start browsing.</p>
          </>
        )}
      </article>
    </div>
  )
}
