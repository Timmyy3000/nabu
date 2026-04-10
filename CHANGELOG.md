# Changelog

All notable changes to Nabu will be documented in this file.

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
