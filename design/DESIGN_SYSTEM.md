# Nabu — Design System

A minimal, markdown-first design system for Nabu: a knowledge OS for humans and agents. The system is built around three ideas: **ink + amber**, **reading-first typography**, and **quiet chrome**. One display cue — the cuneiform wedge `𒀭` (Dingir, the Akkadian divine determinative that precedes Nabu's name) — carries the brand.

---

## 1. Design principles

1. **Minimal chrome, maximal content.** Panes divide with 1px soft rules, never heavy borders. No decorative iconography. One brand glyph.
2. **Markdown reads like a book.** Long-form serif for titles, TL;DR, and body. Sans for UI. Mono for paths, code, and metadata values.
3. **One accent, restrained.** Amber `oklch(0.80 0.120 75)` appears only on active state, key links, the wedge, and section anchors. Never as a background fill beyond a 12% glow.
4. **Structure is navigation.** The filesystem is the IA — no invented categories, no sidebars of features. Tree, notes, note.
5. **Reveal on demand.** Metadata, graph edges, and actions live behind a single `(i) details` drawer, not in the default view.

---

## 2. Color tokens

All colors use `oklch()` for perceptual consistency. Three themes share the same token names.

### 2.1 Scribe (default — ink + amber)

| Token | Value | Use |
|---|---|---|
| `--bg`         | `oklch(0.15 0.006 250)` | Tree column, app base |
| `--bg-pane`    | `oklch(0.17 0.006 250)` | Notes column, reader |
| `--bg-sunk`    | `oklch(0.13 0.006 250)` | TL;DR well, callouts, code bg |
| `--bg-hover`   | `oklch(0.21 0.007 250)` | Hover / selected row |
| `--bg-active`  | `oklch(0.23 0.010 250)` | Pressed / active cell |
| `--rule`       | `oklch(0.26 0.006 250)` | 1px borders |
| `--rule-soft`  | `oklch(0.22 0.006 250)` | Dividers, soft separators |
| `--ink`        | `oklch(0.95 0.008 80)`  | Primary text |
| `--ink-muted`  | `oklch(0.76 0.008 80)`  | Body paragraphs |
| `--ink-dim`    | `oklch(0.58 0.006 250)` | Secondary labels |
| `--ink-faint`  | `oklch(0.44 0.006 250)` | Captions, eyebrows |
| `--accent`     | `oklch(0.80 0.120 75)`  | Wedge, active row, TL;DR rail |
| `--accent-soft`| `oklch(0.62 0.090 75)`  | Code text, active chip border |
| `--accent-glow`| `oklch(0.80 0.120 75 / 0.12)` | Active chip bg, hover |
| `--mark`       | `oklch(0.80 0.120 75 / 0.22)` | Search highlight |

### 2.2 Graphite (monochrome)

Override only the accent family; backgrounds remain identical.

```css
--accent:      oklch(0.88 0 0);
--accent-soft: oklch(0.70 0 0);
--accent-glow: oklch(0.88 0 0 / 0.08);
--mark:        oklch(0.88 0 0 / 0.18);
```

### 2.3 Tablet (warm clay)

Shifts the base toward a warm brown; keeps the amber accent.

```css
--bg:       oklch(0.22 0.020 65);
--bg-pane:  oklch(0.25 0.022 65);
--bg-sunk:  oklch(0.20 0.020 65);
--ink:      oklch(0.94 0.022 80);
--accent:   oklch(0.82 0.130 70);
```

### 2.4 Accessibility

All ink-on-bg pairings exceed WCAG AA for body text (4.5:1+). Amber on `--bg` is AA for large text; never used for small body copy.

---

## 3. Typography

Three families, each with a single job.

| Family | Role | Weights |
|---|---|---|
| **Inter** (`--sans`) | UI, buttons, labels, breadcrumbs | 400, 500, 600, 700 |
| **Newsreader** (`--serif`) | Note titles, TL;DR, body prose, wordmark | 400, 500, 600 |
| **JetBrains Mono** (`--mono`) | Paths, code, tag values, scope | 400, 500 |

### Type scale

| Token | Size | Line-height | Family | Use |
|---|---|---|---|---|
| `reader-title` | 32px | 1.15 | serif 500 | Note H1 |
| `fs-body` | 16px | 1.7 | serif | Markdown paragraphs |
| `note-card-title` | 15px | 1.3 | serif 500 | List-row title |
| `fs-ui` | 13.5px | 1.5 | sans | Tree, inputs, controls |
| `fs-sm` | 12.5px | 1.45 | sans/mono | Sub-metadata |
| `fs-xs` | 11px | 1.4 | sans | Eyebrows, chips |
| `mini` | 10–10.5px | — | sans | Uppercase labels |

### Rules

- Uppercase labels get `letter-spacing: 0.14–0.2em`.
- Body gets `text-wrap: pretty`.
- `font-feature-settings: 'cv11', 'ss01'` on body for Inter's curly-l and single-story g.
- Serif gets `letter-spacing: -0.01em` to -0.02em at display sizes.
- Never use bold on monospace — use `--accent-soft` color instead.

---

## 4. Spacing & layout

### Grid

The app is a fixed three-column shell with no responsive breakpoints at desktop (optional collapse <900px):

| Token | Value | Role |
|---|---|---|
| `--spine-w`  | 320px | Tree + search + scope |
| `--notes-w`  | 320px | Notes in folder |
| `--drawer-w` | 280px | Details drawer (slides over reader) |

### Inner padding

- Tree column: `14px 8px` section padding, `4px 8px` per row
- Notes column: `14px 20px` per card
- Reader article: `48px 48px 96px` (max 720px content width)
- Drawer: `20px 20px 40px`

### Radii

One scale: `--rad: 4px`. Chips are pill (`10px`). Avatars/buttons never rounded beyond `50%` for the info `(i)` glyph.

---

## 5. Iconography

**Policy: almost none.** The system relies on type + color for affordance.

- **`𒀭`** — Dingir wedge. Used once, in the wordmark. Amber.
- **`⌕`** — Unicode search prefix in the search input.
- **`▸`** — Tree caret, rotates 90° when open (160ms).
- **`(i)`** — Serif italic lowercase i in a circle, for the details button.
- **`×`** — Chip dismiss.

No custom SVGs. No Lucide / Feather / Heroicons.

---

## 6. Components

### 6.1 Spine header (top of left column)

- `𒀭 nabu` wordmark (serif 500, 18px) + right-aligned `logout` (xs, faint)
- `SCOPE` eyebrow + mono path
- Bottom: 1px `--rule-soft`

### 6.2 Search input

- Sunk bg, 1px soft rule, `--rad` radius
- `⌕` prefix, placeholder “search vault”
- Focus: `--accent-soft` border + 3px `--accent-glow` ring
- Optional `esc` chip on the right to clear

### 6.3 Tag chip

```
┌──────────┐
│ #alpha   │   pill, 10.5px, sans
└──────────┘
```

- Default: `--ink-dim` text, `--rule` border
- Hover: `--ink` text, `--ink-faint` border
- Active (filtering): `--accent` text, `--accent-soft` border, `--accent-glow` bg

### 6.4 Folder tree row

- Caret (`▸`), 14px wide, rotates on open
- Name + right-aligned count (tabular, faint)
- Active: amber text on `--accent-glow` bg, no bar
- Depth: `6px + depth * 14px` left padding

### 6.5 Note card (list row)

Two-row card in the notes column:

```
Claude's Usability Feedback on Nabu Alpha        ← serif 15/500, --ink
Apr 13, 2026 · 8 min                             ← sans 10.5, --ink-faint
First real agent-driven session …                ← serif 12.5 --ink-dim (clamp 2)
#nabu  #feedback  #alpha  #agent-usability       ← chips xs
```

- Active: `--bg-hover` + 2px left bar in `--accent`; title turns amber
- Hover: `--bg-hover` only

### 6.6 Reader topbar

- Left: breadcrumb trail in mono (`vault / projects / nabu / file.md`), `--ink-faint` with `--ink-muted` leaf
- Right: `(i) details` pill button, 1px soft rule, turns amber on active

### 6.7 Reader article

```
Title                                             ← serif 32/500, -0.02em
author · date · read-time                         ← sans 12, faint
[#tag chips]

┌───────────────────────────────────────────────┐
│ TL;DR  First real agent-driven session …      │  ← sunk bg, 2px amber rail
└───────────────────────────────────────────────┘

WHAT WORKED WELL                                  ← sans 13 600, uppercase, 1px rule
Body copy …                                       ← serif 16/1.7, --ink-muted
The agents.md entrypoint is the killer feature.   ← strong = --ink + 600
`code` in mono, amber-soft, sunk bg
```

### 6.8 Numbered list (`md-ol`)

- Counter on the left in sans 13/600, `--ink-faint`, 22px column
- Each item separated by a `--rule-soft` underline
- Plain Arabic numerals (`1`, `2`, `3`), no leading zeros

### 6.9 Callout

- Sunk bg, 2px amber left rail, `--rad` right-only
- Label in sans 10/600 uppercase, `--accent`
- Body in serif 15/1.6

### 6.10 Details drawer

- Slides in from the right over the reader (280px)
- Cubic-bezier `(0.2, 0.8, 0.2, 1)`, 260ms
- Sections stacked: metadata KV · neighborhood stats · linked from · related · actions
- Stat tiles show serif numeral (22px, amber) + uppercase micro-caption

### 6.11 Tweaks panel

- Fixed bottom-right, 200px wide, border + 1px soft, shadow
- Rows of `label → button` for theme switching
- Buttons: mono 10.5, `--rad: 3px`, active = amber text/border/glow

---

## 7. Motion

- **Tree caret:** 160ms rotate
- **Drawer:** 260ms slide, cubic-bezier `(0.2, 0.8, 0.2, 1)`
- **Hover states:** 120ms color/bg cross-fade
- **No bounce, no spring, no scale-on-hover.** This is a reading tool.

---

## 8. Accessibility

- Focus ring: 3px `--accent-glow` on inputs
- All interactive elements reachable by Tab
- `⌘K` focuses the search input globally
- Drawer has `aria-hidden` mirrored to `open` state
- Breadcrumbs use `<nav aria-label="breadcrumbs">`

---

## 9. Voice & copy

- **Lowercase UI.** `search vault`, `logout`, `scope`, `details`, `tree`, `3 notes`. Only proper nouns and sentence-first words are capitalized.
- **Mono for paths and values.** `/projects/nabu`, `claude-opus-4.6`, `POST /api/vault/folders`.
- **No exclamations, no em-dash hype.** Dry, precise, scribe-like.
- **Labels, not verbs, on eyebrows.** `SOURCE`, `AUTHOR`, `LINKED FROM` — not `View source`.

---

## 10. Do / Don't

**Do**
- Use amber *only* for one thing per screen at any time (active row, active tag, or hover — rarely two).
- Keep the reader below 720px content width.
- Prefer serif for anything you want people to read at length.
- Let the 1px `--rule-soft` divider do the work that borders usually do.

**Don't**
- Add a second accent color.
- Invent decorative SVGs or illustrations.
- Use `--serif` for buttons or UI labels.
- Put borders *and* backgrounds on the same surface — pick one.
- Use ALL CAPS on anything longer than 3 words.

---

## 11. Brand mark

The lockup is `𒀭 nabu` — wedge in amber, wordmark in Newsreader 500. The wedge should never appear without the wordmark in primary contexts. It may appear alone at 22–28px as a loading or footer glyph, in `--accent` with `drop-shadow(0 0 8px --accent-glow)`.

**Clearspace:** `1ex` on all sides (the height of the lowercase `n`).

---

## 12. File map

```
Nabu Redesign.html     # entry, Tweaks + ⌘K wiring
src/
  styles.css           # tokens, components, themes
  data.jsx             # vault tree + note fixtures
  NavRail.jsx          # SpineHeader (wordmark + scope + logout)
  Spine.jsx            # TreeColumn + NotesColumn
  Reader.jsx           # Breadcrumbs + Markdown + InfoDrawer
```

Themes are switched via `data-theme="scribe|graphite|tablet"` on `<html>`; the Tweaks panel persists the choice through the `__edit_mode_set_keys` protocol.
