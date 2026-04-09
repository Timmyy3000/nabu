# Contributing to Nabu

Thanks for contributing.

Nabu is an open-source, markdown-native knowledge OS for humans and agents. The goal is not to build a generic notes app — it is to build a shared knowledge environment that feels like Obsidian on the web.

## Before you build

Read:
- `README.md`
- `AGENTS.md`
- relevant docs in `docs/`

## Engineering rules

- Use red-green-refactor TDD by default
- Aim for strong automated coverage on production behavior
- Keep docs in sync with implementation
- Prefer small, focused commits
- Plan major features before building them

## Scratch work

Use the gitignored `scratchpad/` directory for:
- plans
- temporary notes
- todo drafts
- napkin notes for future sessions

Do not commit scratchpad contents unless there is an explicit reason to publish them.

## Local setup

### Preferred local package manager

Nabu prefers **Bun** for local development.

```bash
bun install
bun run dev
```

### Alternative

If Bun is unavailable, npm also works:

```bash
npm install
npm run dev
```

## Quality checks

Run these before opening a PR:

```bash
npm run lint
npm run test -- --run
npm run build
```

## CI

CI currently uses Node + npm for maximum compatibility and reliability.

## Commit style

Prefer conventional-ish commit messages, for example:
- `feat: add note tree API`
- `fix: handle invalid frontmatter`
- `docs: clarify vault setup`
- `test: cover wiki-link parser`

## Product north star

A person should be able to deploy Nabu, mount a markdown vault, open a browser, and say:

> This is my knowledge space, and both I and my agents can traverse it.
