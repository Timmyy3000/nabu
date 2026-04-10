export function AgentsPage() {
  return (
    <article className="agents-doc panel">
      <p className="eyebrow">Nabu</p>
      <h1>/agents.md</h1>
      <p className="muted">Markdown-native knowledge OS for humans and agents.</p>

      <h2>Purpose</h2>
      <p>This page is the starting point for agents using this Nabu instance. Humans can read it too.</p>

      <h2>Authentication</h2>
      <p>This hosted instance uses shared-password auth. Authenticate via `/login`, then use the browser session cookie.</p>
      <p>Protected retrieval routes return `401 Unauthorized` if the session is missing or expired.</p>

      <h2>Current Retrieval Surfaces</h2>
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
          <code>GET /api/vault/search?q=&amp;path=&amp;limit=&amp;offset=</code>: lexical search over note metadata and body.
        </li>
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
        <li>Use note `body` when exact wording matters.</li>
        <li>Frontmatter is metadata; prose intent is in the markdown body.</li>
        <li>Be explicit about summary vs direct quote.</li>
      </ul>

      <h2>Current Scope</h2>
      <ul>
        <li>No embeddings-first retrieval API.</li>
        <li>No graph/backlinks endpoint.</li>
        <li>No write/update API.</li>
        <li>This hosted surface is currently read-oriented.</li>
      </ul>

      <h2>Practical Usage Example</h2>
      <ol>
        <li>Read `/agents.md`.</li>
        <li>Read `/api/vault/tree` to map folder structure.</li>
        <li>Read `/api/vault/folders?path=...` for the target folder.</li>
        <li>Read target notes via `/api/vault/notes/by-path?path=...` once `relPath` is known.</li>
      </ol>
    </article>
  )
}
