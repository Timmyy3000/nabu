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

- **Frontend:** React + Vite + TanStack Router + TanStack Query
- **Backend:** lightweight Node service for filesystem traversal, indexing, rendering, and auth
- **Storage:** local/server filesystem mounted via `KNOWLEDGE_PATH`
- **Deployment:** Dokploy with mounted volume + password auth

## Why not put notes in the repo?

Because open-source code and private knowledge are different things.

The codebase should be publishable.
The knowledge bank should stay private unless intentionally shared.

## Initial API ideas

- `GET /api/tree` → folder and note hierarchy
- `GET /api/notes/:slug` → note content + metadata
- `GET /api/tags` → tag index
- `GET /api/search?q=` → note search
- `GET /api/backlinks/:slug` → inferred references

## Long-term ideas

- graph visualization
- wiki-style internal links
- note editing with git-backed history
- multi-vault support
- per-agent scoped access
