# AGENTS.md

This repository is built with agents in mind.

## What Nabu is

Nabu is an open-source, markdown-native knowledge OS for humans and agents.

Core idea:
- it should feel like Obsidian on the web
- the filesystem remains the source of truth
- humans navigate through the UI
- agents traverse the same shared knowledge space through files and APIs

## Engineering conventions

### 1. Red-green-refactor TDD

Default to test-driven development:
- write a failing test first
- implement the smallest thing to make it pass
- refactor while keeping tests green

### 2. Full coverage mindset

Aim for full automated test coverage on production code.

That does not mean writing useless tests for the sake of numbers. It means production behavior should be exercised and protected.

### 3. Plan before major features

Before implementing a major feature, create a detailed plan in `scratchpad/plans/`.

Plans are working documents. They are not part of the public repo by default.

### 4. Keep scratch work out of git

Use `scratchpad/` for temporary working material:
- `scratchpad/plans/` for feature plans
- `scratchpad/notes/` for temporary implementation notes
- `scratchpad/todos/` for roadmap and checklist drafts
- `scratchpad/napkin.md` for quick durable notes to future sessions

`scratchpad/` should stay gitignored unless there is an explicit reason to publish something from it.

### 5. Prefer simple architecture first

Do not overengineer early.

Current bias:
- React + Vite for frontend
- TanStack Router and TanStack Query
- lightweight backend for filesystem access and auth
- filesystem-mounted markdown vault outside the repo

### 6. Protect the product idea

Do not drift into building a generic notes CRUD app.

Nabu is specifically a shared knowledge environment for humans and agents.

### 7. Keep private knowledge out of the repository

The repo contains the engine, docs, and safe examples.

Real user notes should live outside the repository and be mounted via configuration such as `KNOWLEDGE_PATH`.

### 8. Test the boundaries

Pay extra attention to:
- path traversal and filesystem safety
- auth/session behavior
- markdown/frontmatter parsing edge cases
- wiki-link resolution and backlink integrity
- API contracts used by agents

## Working style

When making changes:
- prefer small commits
- keep docs in sync with implementation
- update tests with behavior changes
- leave useful notes in `scratchpad/napkin.md` when future-you will benefit

## Product north star

A person should be able to deploy Nabu, mount a markdown vault, open a browser, and say:

> This is my knowledge space, and both I and my agents can traverse it.
