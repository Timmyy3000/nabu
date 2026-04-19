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
- `GET /api/vault/notes/by-path?path=` → deterministic note lookup by canonical vault-relative path
- `GET /api/vault/notes/neighborhood?path=` → outgoing links, backlinks, related notes, and stats
- `GET /api/vault/search?q=&path=&tag=` → lexical search with exact phrase parsing and path/tag filters
- `POST /api/vault/folders` → create folders inside the mounted vault
- `POST /api/vault/notes` → create markdown notes
- `PUT /api/vault/notes/by-path` → update markdown notes by canonical path

## Long-term ideas

- graph visualization
- wiki-style internal links
- note editing with git-backed history
- multi-vault support
- per-agent scoped access
