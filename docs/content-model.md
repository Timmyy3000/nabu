# Content model

## Filesystem-first

A Nabu knowledge bank is just a folder tree of markdown files.

```text
knowledge/
  ideas/
    ai/
      agent-memory.md
  projects/
    nabu/
      roadmap.md
```

## Frontmatter example

```yaml
---
title: Agent memory
slug: agent-memory
tags:
  - ai
  - memory
summary: Shared notes can be traversed by both humans and agents.
createdAt: 2026-04-09
updatedAt: 2026-04-09
---
```

## Conventions

- `title`: display name
- `slug`: stable identifier for routes and references
- `tags`: lightweight cross-cutting taxonomy
- `summary`: short preview text
- file path: category/subcategory structure

## Design goal

The content should remain useful even without the app.

That means opening the folder in a text editor should still feel normal.
