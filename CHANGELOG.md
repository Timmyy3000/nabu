# Changelog

All notable changes to Nabu will be documented in this file.

## [0.4.0] - 2026-04-19

Design-system release.

### Shipped

- Shipped the design system and redesign into the real app instead of leaving it trapped in a standalone HTML mock
- Rebuilt the vault UI around the new reading-first three-pane shell with quieter chrome and tighter hierarchy
- Redesigned the login and `/agents.md` surfaces to match the same product language
- Added exactly two supported themes: `scribe` and `graphite`, with persistent switching in the UI
- Exposed note neighborhood data directly in the browse payload so the hosted reader can render metadata, backlinks, outgoing links, related notes, and stats in a details drawer
- Restored functional parity across the redesigned UI: search, path/tag filtering, clickable tag chips, copy-path, internal note links, frontmatter metadata, and traversal affordances

### Why it matters

Nabu now actually looks like Nabu. The core vault surface, login flow, and agent docs share the same visual language and the same product posture: private, markdown-first, and built for humans and agents using the same knowledge space.

## [0.3.0] - 2026-04-13

Workspace polish release.

### Shipped

- Obsidian-inspired workspace overhaul with a darker, denser, calmer reading interface
- Stronger pane hierarchy across navigation, note list/search, and note content
- Improved markdown presentation for headings, code blocks, blockquotes, and note metadata
- CI reliability fix by syncing `package-lock.json` with the release version bump

### Why it matters

Nabu now feels much closer to a real knowledge workspace instead of a generic web dashboard. The reading surface has more authority, the side rails are calmer, and the hosted branch release process is back in a clean state after the CI lockfile fix.

## [0.2.0] - 2026-04-13

Agent-operability release.

### Shipped

- Deterministic note retrieval by canonical vault-relative path
- Lexical search with exact phrase parsing and tag/path filters
- Internal wiki-link and markdown note-link parsing
- Backlinks and note neighborhood traversal
- `/agents.md` expanded into a practical agent contract
- Authenticated write surfaces for:
  - folder creation
  - note creation
  - note update by path
- Immediate read/search consistency after successful writes

### Why it matters

Nabu is no longer just a hosted markdown reader. With v0.2.0, an authenticated agent can discover how the system works via `/agents.md`, read and search the vault, traverse note relationships, and perform basic write operations directly against the filesystem-backed knowledge base.

## [0.1.1] - 2026-04-10

Deployment DX release.

### Shipped

- Automatic creation of `KNOWLEDGE_PATH` on first boot when the directory does not yet exist
- Simpler default env example for mounted app data at `/data/nabu/knowledge`
- Updated deployment docs to reflect the mounted parent directory + auto-created knowledge folder flow

### Why it matters

Nabu is aiming for dead-simple self-hosting. A fresh deploy should not fail just because a user forgot to pre-create a subdirectory inside their mounted data path.

## [0.1.0] - 2026-04-10

First deployable MVP release.

### Shipped

- Mounted vault configuration via `KNOWLEDGE_PATH`
- Safe markdown scanning for vault files
- Frontmatter parsing with normalized metadata
- In-memory vault index primitives with collision tracking
- Read-only retrieval routes for vault navigation
- Folder tree and folder note listing retrieval
- Web note browsing UI with folder tree and note rendering
- Simple env-password auth with session cookies

### Product frame

Nabu v0.1.0 establishes the core idea: a filesystem-first, markdown-native knowledge OS that humans and agents can both traverse through a private web interface.
