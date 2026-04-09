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
- React + Vite
- TanStack Router
- TanStack Query
- A lightweight backend for safe filesystem access and auth
- Dokploy-friendly deployment
- Password-protected private knowledge spaces

## Open-source model

Nabu is open source from day one.

The repository contains the **engine**, not your private notes.

Your real knowledge bank should live outside the repo and be mounted into the app at runtime.

## Planned architecture

```text
nabu/
  src/                # web app
  docs/               # architecture and content format docs
  examples/           # safe example content
  server/             # backend API (planned)
```

## Local development

```bash
npm install
npm run dev
```

## Content strategy

Real content should be mounted from a separate path, for example:

```bash
KNOWLEDGE_PATH=/data/nabu
```

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
- [ ] Add testing and CI foundations
- [ ] Build backend note indexer
- [ ] Render markdown notes from disk
- [ ] Add tags, backlinks, and graph traversal
- [ ] Add auth for private deployments
- [ ] Ship Dokploy deployment config

## License

MIT
