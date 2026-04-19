import { getAgentBootstrapContract } from '../lib/agent/bootstrap'

type AgentsPageProps = {
  authenticated: boolean
}

function AgentsLayout({ children, eyebrow }: { children: React.ReactNode; eyebrow: string }) {
  return (
    <section className="route-page docs-page">
      <article className="docs-surface agents-doc">
        <div className="wordmark docs-wordmark" aria-label="𒀭 nabu">
          <span className="wedge">𒀭</span>
          <span className="wordmark-text">nabu</span>
        </div>
        <p className="section-label">{eyebrow}</p>
        {children}
      </article>
    </section>
  )
}

export function AgentsPage({ authenticated }: AgentsPageProps) {
  const bootstrap = getAgentBootstrapContract()

  if (!authenticated) {
    return (
      <AgentsLayout eyebrow="public bootstrap">
        <h1>/agents.md</h1>
        <p className="docs-lede">Public bootstrap contract for agents. Authenticate first; the full contract is available after login.</p>

        <h2>Authentication</h2>
        <p>Use a normal HTTP form POST. Browser automation should not be required.</p>
        <ul>
          <li>
            <code>{`${bootstrap.auth.method} ${bootstrap.auth.endpoint}`}</code>
          </li>
          <li>
            <strong>Content-Type:</strong> <code>{bootstrap.auth.contentType}</code>
          </li>
          <li>
            <strong>Fields:</strong> <code>{bootstrap.auth.fields.join(', ')}</code>
          </li>
          <li>
            <strong>Session cookie:</strong> <code>{bootstrap.auth.cookieName}</code>
          </li>
          <li>
            <strong>Success:</strong> {bootstrap.auth.redirectBehavior}
          </li>
        </ul>

        <h2>Canonical identity</h2>
        <ul>
          <li>{bootstrap.identity.note}</li>
          <li>
            Use <code>{bootstrap.identity.deterministicRead}</code> for deterministic reads.
          </li>
          <li>
            <code>{bootstrap.identity.convenienceRead}</code> is convenience-only and may collide.
          </li>
        </ul>

        <h2>Machine-readable bootstrap</h2>
        <p>
          If you are calling Nabu as an agent, prefer <code>/api/agent/bootstrap</code> first, then authenticate, then return to
          <code> /agents.md</code> for the full contract.
        </p>
      </AgentsLayout>
    )
  }

  return (
    <AgentsLayout eyebrow="agent contract">
      <h1>/agents.md</h1>
      <p className="docs-lede">Markdown-native knowledge OS for humans and agents.</p>

      <h2>Purpose</h2>
      <p>This page is the starting point for agents using this Nabu instance. Humans can read it too.</p>

      <h2>Authentication</h2>
      <p>Authenticate with a normal HTTP request, not browser automation.</p>
      <ul>
        <li>
          <code>{`${bootstrap.auth.method} ${bootstrap.auth.endpoint}`}</code>
        </li>
        <li>
          <strong>Content-Type:</strong> <code>{bootstrap.auth.contentType}</code>
        </li>
        <li>
          <strong>Fields:</strong> <code>{bootstrap.auth.fields.join(', ')}</code>
        </li>
        <li>
          <strong>Cookie:</strong> <code>{bootstrap.auth.cookieName}</code>
        </li>
        <li>Reuse the session cookie on subsequent API requests.</li>
        <li>Protected routes return `401 Unauthorized` if the session is missing or expired.</li>
      </ul>

      <h2>Read Surfaces</h2>
      <ul>
        <li>
          <code>GET /api/vault/</code>: full vault index summary (`stats`, `warnings`, `folders`, `notes`).
        </li>
        <li>
          <code>GET /api/vault/index/stats</code>: compact index stats (`stats`, `warnings`, `builtAt`).
        </li>
        <li>
          <code>GET /api/vault/tree</code>: deterministic folder tree with note counts.
        </li>
        <li>
          <code>GET /api/vault/folders?path=</code>: folder listing for a vault-relative path (`folders`, `notes`).
        </li>
        <li>
          <code>GET /api/vault/notes/$slug</code>: note lookup by slug (`note`, `collisions`, `builtAt`).
        </li>
        <li>
          <code>GET /api/vault/notes/by-path?path=</code>: deterministic note lookup by canonical vault-relative path (`note`, `builtAt`).
        </li>
        <li>
          <code>GET /api/vault/notes/neighborhood?path=</code>: note-centered traversal payload (`note`, `outgoing`, `backlinks`, `relatedNotes`, `stats`, `builtAt`).
        </li>
        <li>
          <code>GET /api/vault/search?q=&amp;path=&amp;tag=&amp;limit=&amp;offset=</code>: lexical search with exact phrase parsing and tag/path filters.
        </li>
      </ul>

      <h2>Write Surfaces</h2>
      <ul>
        <li>
          <code>POST /api/vault/folders</code>: create a folder. JSON body: <code>{'{"path":"projects/nabu/specs"}'}</code>
        </li>
        <li>
          <code>POST /api/vault/notes</code>: create a markdown note. JSON body: <code>{'{"path":"projects/nabu/specs/agent-operability","rawMarkdown":"---\ntitle: Agent Operability\ntags: [agents]\n---\n# Agent Operability"}'}</code>
        </li>
        <li>
          <code>PUT /api/vault/notes/by-path</code>: update an existing markdown note. JSON body: <code>{'{"path":"projects/nabu/specs/agent-operability.md","rawMarkdown":"---\ntitle: Agent Operability\nupdatedAt: 2026-04-14T00:00:00Z\n---\n# Agent Operability\n\nUpdated"}'}</code>
        </li>
      </ul>

      <h2>Metadata Conventions</h2>
      <ul>
        <li>Frontmatter is the canonical metadata surface.</li>
        <li>Recommended fields: <code>title</code>, <code>summary</code>, <code>tags</code>, <code>author</code>/<code>authors</code>, <code>source</code>, <code>references</code>, <code>createdAt</code>, <code>updatedAt</code>.</li>
        <li>Legacy body conventions like <code>**TL;DR:**</code>, <code>**Author:**</code>, <code>**Source:**</code>, and <code>**Tags:**</code> are parsed for backward compatibility, but new notes should prefer frontmatter.</li>
      </ul>

      <h2>Write Semantics</h2>
      <ul>
        <li>Use vault-relative paths only.</li>
        <li>Paths must be safe: no absolute paths, no `.` or `..` traversal segments.</li>
        <li>Markdown notes are the write primitive. Send full `rawMarkdown` content.</li>
        <li>`POST /api/vault/notes` appends `.md` when the note path is given without it.</li>
        <li>Folder creation creates parent directories as needed.</li>
        <li>Note creation does not silently overwrite an existing note.</li>
        <li>Successful writes refresh the in-memory index, so retrieval/search should reflect the new state immediately.</li>
      </ul>

      <h2>Common Error Semantics</h2>
      <ul>
        <li>`400`: invalid path or invalid request body.</li>
        <li>`401`: missing or expired authenticated session.</li>
        <li>`404`: target note not found for update/read flows.</li>
        <li>`409`: attempted to create a note that already exists.</li>
      </ul>

      <h2>Current Human Navigation Surface</h2>
      <p>Notes are browsed in the hosted reader UI at `/` through folder and note selection.</p>

      <h2>Note Identity Conventions</h2>
      <ul>
        <li>Use vault-relative `relPath` as the canonical location.</li>
        <li>Use `/api/vault/notes/by-path?path=...` for deterministic retrieval when `relPath` is known.</li>
        <li>Use `slug` for lookup/navigation when convenient.</li>
        <li>Slug collisions can exist; check `collisions` when using `/api/vault/notes/$slug`.</li>
      </ul>

      <h2>Response Conventions</h2>
      <ul>
        <li>When referencing a note, cite `relPath` and `title` together.</li>
        <li>Use structured metadata fields when available; fall back to `body` when exact wording matters.</li>
        <li>Be explicit about summary vs direct quote.</li>
      </ul>

      <h2>Recommended Agent Workflows</h2>
      <ol>
        <li>Fetch <code>/api/agent/bootstrap</code> or read the public bootstrap at <code>/agents.md</code>.</li>
        <li>Authenticate via <code>/api/auth/login</code> and reuse the session cookie.</li>
        <li>Use <code>/api/vault/tree</code> or <code>/api/vault/folders?path=...</code> to inspect the target location.</li>
        <li>Create missing folders with <code>POST /api/vault/folders</code>.</li>
        <li>Create notes with <code>POST /api/vault/notes</code> or update notes with <code>PUT /api/vault/notes/by-path</code>.</li>
        <li>Verify with <code>GET /api/vault/notes/by-path?path=...</code>.</li>
        <li>Use <code>/api/vault/search</code> and <code>/api/vault/notes/neighborhood</code> for retrieval and traversal.</li>
      </ol>

      <h2>Current Scope</h2>
      <ul>
        <li>No embeddings-first retrieval API.</li>
        <li>No rename/delete API yet.</li>
        <li>No browser editing UI yet.</li>
        <li>This hosted surface is now read-write for basic folder and markdown note operations.</li>
      </ul>
    </AgentsLayout>
  )
}
