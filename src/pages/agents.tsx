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
      <p>Protected routes return `401 Unauthorized` if the session is missing or expired.</p>

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
          <code>POST /api/vault/notes</code>: create a markdown note. JSON body: <code>{'{"path":"projects/nabu/specs/agent-operability","rawMarkdown":"# Agent Operability"}'}</code>
        </li>
        <li>
          <code>PUT /api/vault/notes/by-path</code>: update an existing markdown note. JSON body: <code>{'{"path":"projects/nabu/specs/agent-operability.md","rawMarkdown":"# Agent Operability\n\nUpdated"}'}</code>
        </li>
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
        <li>Use note `body` when exact wording matters.</li>
        <li>Frontmatter is metadata; prose intent is in the markdown body.</li>
        <li>Be explicit about summary vs direct quote.</li>
      </ul>

      <h2>Recommended Agent Workflows</h2>
      <ol>
        <li>Read `/agents.md`.</li>
        <li>Authenticate via `/login` and keep the session cookie.</li>
        <li>Use `/api/vault/tree` or `/api/vault/folders?path=...` to inspect the target location.</li>
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
    </article>
  )
}
