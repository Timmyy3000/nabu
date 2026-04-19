# Nabu

Nabu is an open-source, markdown-native knowledge OS for humans and agents.

Think of it as Obsidian-on-the-web: a private web UI over a filesystem of markdown notes, designed so the same knowledge space can be navigated by both people and AI agents.

## Vision

- **Markdown is the database**
- **The filesystem is the source of truth**
- **Humans get a clean web UI**
- **Agents can traverse the same knowledge bank directly**
- **Private content stays outside the app repo**

## Why Nabu?

Nabu is named after the Mesopotamian god of writing, scribes, literacy, and recorded knowledge.

## Project Status

This project is in active early development.

Current direction:
- TanStack Start
- Filesystem-first mounted vaults via `KNOWLEDGE_PATH`
- Safe server-side indexing, retrieval, and authenticated writes
- Dokploy-friendly deployment
- Password-protected private knowledge spaces

## Shipped so far

- Mounted vault configuration and validation
- Automatic vault directory creation on first boot
- Safe markdown file scanning
- Frontmatter + metadata normalization
- In-memory vault indexing primitives
- Folder tree and note listing retrieval
- Web note browsing UI with rendered markdown
- Env-based password auth with session cookies
- Deterministic note retrieval by canonical vault-relative path
- Lexical search with exact phrase parsing and tag/path filters
- Wiki-link + markdown-link parsing, backlinks, and note neighborhood traversal
- `/agents.md` agent-facing entrypoint with explicit read/write API contract
- Authenticated folder creation and markdown note create/update by path

## Open-source model

Nabu is open source from day one.

The repository contains the **engine**, not your private notes.

Your real knowledge bank should live outside the repo and be mounted into the app at runtime.

## Runtime shape

```text
nabu/
  src/                # app routes, UI, and server handlers
  docs/               # architecture and content format docs
  examples/           # safe example content
```

TanStack Start currently serves both the frontend routes and the server-backed API surfaces from the same integrated app.

## Local development

Preferred local package manager: **Bun**

```bash
bun install
bun run dev
bun run lint
bun run test:bun
bun run build
```

If Bun is not available, npm also works:

```bash
npm install
npm run dev
npm run lint
npm run test -- --run
npm run build
```

Set `NABU_PASSWORD` before running for private access, for example:

```bash
NABU_PASSWORD=dev-password bun run dev
```

## Tooling

- **Local development:** Bun preferred (`bun.lock` is canonical locally)
- **CI:** Node + npm for reliability (`package-lock.json` kept for CI)

## Content strategy

Real content should be mounted from a separate path, for example:

```bash
KNOWLEDGE_PATH=/data/nabu/knowledge
NABU_PASSWORD=***
```

Mount `/data/nabu` (or another parent app-data directory) as persistent storage and let Nabu create `/knowledge` on first boot if it does not already exist.

Repo-safe demo content can live in `examples/`.

## Engineering conventions

- Red-green-refactor TDD by default
- Aim for full test coverage on production code
- Write detailed plans before major features
- Store working plans in an uncommitted `scratchpad/` folder

## First milestones

- [x] Initialize frontend app shell
- [x] Establish open-source repo structure
- [x] Add documentation for architecture and content model
- [x] Add testing and CI foundations
- [x] Build backend note indexer
- [x] Render markdown notes from disk
- [x] Add auth for private deployments
- [x] Add `/agents.md` agent-facing entrypoint
- [x] Add tags, backlinks, lexical search, and neighborhood traversal
- [ ] Ship Dokploy deployment config

## License

MIT
