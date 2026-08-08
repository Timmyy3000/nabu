# Nabu architecture

## Core idea

Nabu is a markdown-native knowledge OS.

The app does not own your notes. It indexes and renders a filesystem that already exists.

## Principles

1. Markdown files are the canonical data model.
2. Folder structure expresses categories and subcategories.
3. Frontmatter provides metadata such as title, slug, tags, summary, and timestamps.
4. The web app is a view over the filesystem, not a replacement for it.
5. Agents and humans should be able to navigate the same knowledge space.

## Proposed runtime shape

- **App runtime:** TanStack Start for the integrated web UI and server routes
- **Frontend:** React + TanStack Router + TanStack Query
- **Backend surfaces:** server routes for filesystem traversal, indexing, rendering, auth, and agent-facing APIs
- **Storage:** local/server filesystem mounted via `KNOWLEDGE_PATH`
- **Deployment:** Dokploy with mounted volume + password auth

## Why not put notes in the repo?

Because open-source code and private knowledge are different things.

The codebase should be publishable.
The knowledge bank should stay private unless intentionally shared.

## Current API surfaces

- `GET /api/vault/` → vault index summary
- `GET /api/vault/index/stats` → compact index stats
- `GET /api/vault/tree` → folder hierarchy
- `GET /api/vault/folders?path=` → folder listing for a vault-relative path
- `GET /api/vault/notes/$slug` → note lookup by slug with collision metadata
- `GET /api/vault/notes/by-path?path=` → deterministic note lookup by canonical vault-relative path, including exact `rawMarkdown` and an additive `rawContentHash` revision for source editing
- `GET /api/vault/notes/neighborhood?path=` → outgoing links, backlinks, related notes, and stats
- `GET /api/vault/search?q=&path=&tag=` → lexical search with exact phrase parsing and path/tag filters
- `POST /api/vault/folders` → create folders inside the mounted vault
- `POST /api/vault/notes` → create markdown notes
- `PUT /api/vault/notes/by-path` → update markdown notes by canonical path; human source saves can include `expectedRawContentHash` to reject stale raw-file edits

## Temporary shared spaces

Shared spaces are durable server-side leases over a non-root vault folder. They
are live recursive path boundaries, not snapshots: existing descendants are
visible, and files or folders created later below the shared root become
visible automatically. Parent folders, siblings, prefix-collision paths, and
symlink targets remain outside the scope.

The agent-facing lifecycle is:

1. `POST /api/shared-spaces/proposals` recursively previews the exact current
   files and folders and has no sharing side effect.
2. `POST /api/shared-spaces/` requires `{ "confirmed": true }` and creates a
   1-hour, one-time invite.
3. `POST /api/shared-spaces/invites/redeem` atomically exchanges the invite for
   a scoped bearer access token.
4. `POST /api/shared-spaces/:id/read-link` issues one active read-only browser
   URL per space; issuing another rotates the previous URL, and `DELETE` on the
   same route revokes it.
5. `POST /api/shared-spaces/:id/revoke` or lease expiry invalidates all access
   synchronously; cleanup is optional and asynchronous.

Shared-space metadata lives in server-side SQLite at
`NABU_DATA_PATH/shared-spaces.sqlite`, outside the Markdown vault. Production
must configure `NABU_DATA_PATH` as an absolute path on persistent storage;
there is no production fallback to the app working directory. Only SHA-256
hashes of invite, access-token, and read-link secrets are stored. Raw secrets
are returned only at creation/redemption/issue time. File-backed deployments are single-replica;
multiple replicas require a shared transactional database.

Read-link URLs use `/?path=<root>&token=<opaque-secret>` and grant anonymous
read-only access to the linked root and descendants through the browser and
read APIs. They are capped at 183 days and cannot outlive the parent lease.
Token-bearing responses are private and non-cacheable, and outside-scope paths,
links, and assets return generic unavailable responses.

The owner/password and password-derived bearer authentication contract uses the
same `NABU_PASSWORD` for human sessions and remote MCP. Shared bearer tokens
resolve to a scoped principal, and the same authorization service is applied
before every vault read, search, graph/link projection, listing, and mutation.

## Revision-aware writes

Note reads return a raw-Markdown SHA-256 `note.revision` and a matching ETag.
Updates and moves accept that value through `If-Match: "<revision>"` or the
`expectedRevision` body field. Shared-token writes require it immediately.
Existing owner agents may continue sending legacy writes during the migration
period; successful legacy writes include a machine-readable migration warning.
When strict owner mode is enabled, missing revisions return `428
WRITE_REVISION_REQUIRED`, and stale revisions return `409
STALE_NOTE_REVISION`. Agents should re-read, merge, and retry rather than
silently overwriting concurrent changes.

## Long-term ideas

- graph visualization
- wiki-style internal links
- note editing with git-backed history
- multi-vault support
- per-agent scoped access beyond temporary shared-space leases
