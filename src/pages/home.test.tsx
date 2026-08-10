// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './home'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  useBlocker: vi.fn(),
  useRouter: () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }),
  Link: ({ children, to, search, ...props }: ComponentProps<'a'> & { to?: string; search?: unknown }) => {
    const href = typeof to === 'string' ? to : '/'
    const previousSearch = {
      folder: 'prev-folder',
      note: 'prev-note',
      q: 'prev-q',
      searchPath: 'prev-path',
      searchTag: 'prev-tag',
    }
    const nextSearch = typeof search === 'function' ? search(previousSearch) : null

    return (
      <a
        {...props}
        href={href}
        data-search={typeof search === 'function' ? 'fn' : undefined}
        data-search-value={nextSearch ? JSON.stringify(nextSearch) : undefined}
      >
        {children}
      </a>
    )
  },
  useNavigate: () => navigate,
}))

const writeText = vi.fn().mockResolvedValue(undefined)

function buildBrowseFixture() {
  return {
    tree: {
      path: '',
      name: '',
      directNoteCount: 0,
      noteCount: 2,
      children: [
        {
          path: 'ideas',
          name: 'ideas',
          directNoteCount: 2,
          noteCount: 2,
          children: [],
        },
      ],
    },
    folder: {
      path: 'ideas',
      name: 'ideas',
      folders: [],
      notes: [
        {
          id: 'ideas/alpha.md',
          relPath: 'ideas/alpha.md',
          slug: 'alpha',
          title: 'alpha',
          summary: 'first real agent-driven session in nabu.',
          tags: ['ai', 'alpha'],
          createdAt: '2026-04-13T00:00:00.000Z',
          updatedAt: '2026-04-14T00:00:00.000Z',
        },
      ],
    },
    selectedNoteSlug: 'alpha',
    note: {
      id: 'ideas/alpha.md',
      relPath: 'ideas/alpha.md',
      slug: 'alpha',
      title: 'alpha',
      summary: 'first real agent-driven session in nabu.',
      tags: ['ai', 'alpha'],
      authors: ['Claude'],
      source: 'https://usedocsyde.com',
      references: ['projects/roadmap.md', 'ideas/beta.md'],
      createdAt: '2026-04-13T00:00:00.000Z',
      updatedAt: '2026-04-14T00:00:00.000Z',
      frontmatter: {
        status: 'draft',
        confidence: 'high',
      },
      rawMarkdown: '# Alpha\n\nSee [[beta]] and [Roadmap Doc](../projects/roadmap.md).',
      rawContentHash: 'alpha-raw-hash',
      body: '# Alpha\n\nSee [[beta]] and [Roadmap Doc](../projects/roadmap.md).',
      outgoingLinks: [
        {
          raw: '[[beta]]',
          kind: 'wiki',
          text: null,
          target: 'beta',
          resolved: true,
          targetRelPath: 'ideas/beta.md',
          targetSlug: 'beta',
          targetTitle: 'Beta',
        },
        {
          raw: '[Roadmap Doc](../projects/roadmap.md)',
          kind: 'markdown',
          text: 'Roadmap Doc',
          target: '../projects/roadmap.md',
          resolved: true,
          targetRelPath: 'projects/roadmap.md',
          targetSlug: 'roadmap',
          targetTitle: 'Roadmap',
        },
      ],
      backlinks: [
        {
          sourceRelPath: 'projects/roadmap.md',
          sourceSlug: 'roadmap',
          sourceTitle: 'Roadmap',
          kind: 'markdown',
          text: 'Alpha',
          raw: '[Alpha](../ideas/alpha.md)',
        },
      ],
    },
    noteNeighborhood: {
      note: {
        relPath: 'ideas/alpha.md',
        slug: 'alpha',
        title: 'alpha',
      },
      outgoing: [
        {
          raw: '[[beta]]',
          kind: 'wiki',
          text: null,
          target: 'beta',
          targetRelPath: 'ideas/beta.md',
          targetSlug: 'beta',
          targetTitle: 'Beta',
        },
        {
          raw: '[Roadmap](../projects/roadmap.md)',
          kind: 'markdown',
          text: 'Roadmap',
          target: '../projects/roadmap.md',
          targetRelPath: 'projects/roadmap.md',
          targetSlug: 'roadmap',
          targetTitle: 'Roadmap',
        },
      ],
      backlinks: [
        {
          sourceRelPath: 'projects/roadmap.md',
          sourceSlug: 'roadmap',
          sourceTitle: 'Roadmap',
          kind: 'markdown',
          text: 'Alpha',
          raw: '[Alpha](../ideas/alpha.md)',
        },
      ],
      unresolvedOutgoing: [
        {
          raw: '[[missing-note]]',
          kind: 'wiki',
          text: null,
          target: 'missing-note',
          resolved: false,
          targetRelPath: null,
          targetSlug: null,
        },
      ],
      relatedNotes: [
        {
          relPath: 'projects/roadmap.md',
          slug: 'roadmap',
          title: 'Roadmap',
          connectionCount: 2,
          reasons: ['backlink', 'shared-folder'],
        },
      ],
      stats: {
        outgoingResolvedCount: 2,
        backlinkCount: 1,
        unresolvedOutgoingCount: 1,
      },
    },
  }
}

beforeEach(() => {
  navigate.mockClear()
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  writeText.mockClear()
  vi.stubGlobal('fetch', vi.fn())
})

describe('HomePage', () => {
  it('renders the redesigned browse UI when no query is active', () => {
    const { container } = render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    expect(screen.getByLabelText(/𒀭 nabu/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'settings' })).toHaveAttribute('href', '/settings/agents')
    expect(screen.getByRole('heading', { name: /ideas/i })).toBeInTheDocument()
    expect(screen.getAllByText('ideas/alpha.md').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('heading', { name: 'alpha' })).toBeInTheDocument()
    expect(screen.getAllByText('first real agent-driven session in nabu.').length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('.vault-shell')).toBeTruthy()
    expect(container.querySelectorAll('.vault-pane')).toHaveLength(3)
    expect(container.querySelector('.vault-reader')).toBeTruthy()
  })

  it('preserves flat and nested ordered and unordered list structure in the reading view', () => {
    const browse = buildBrowseFixture()
    const markdown = `## Ordered list

1. First item
2. Second item
   - Nested bullet
   - Nested bullet
3. Third item

## Unordered list

- First item
- Second item
  1. Nested ordered item
     - Deep bullet
- Third item`
    browse.note.body = markdown
    browse.note.rawMarkdown = markdown

    const { container } = render(<HomePage browse={browse} search={null} searchPathInput="" searchTagInput="" />)
    const noteMarkdown = container.querySelector('.note-markdown')
    const topLevelLists = Array.from(noteMarkdown?.children ?? []).filter((child) => child.tagName === 'OL' || child.tagName === 'UL')

    expect(topLevelLists.map((list) => list.tagName)).toEqual(['OL', 'UL'])

    const [ordered, unordered] = topLevelLists
    expect(ordered.children).toHaveLength(3)
    expect(unordered.children).toHaveLength(3)
    expect(ordered.querySelector('li:nth-child(2) > ul')?.children).toHaveLength(2)
    expect(unordered.querySelector('li:nth-child(2) > ol')?.children).toHaveLength(1)
    expect(unordered.querySelector('li:nth-child(2) > ol li > ul')).toHaveTextContent('Deep bullet')
  })

  it('copies the canonical note path when the path label is clicked', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    fireEvent.click(screen.getByRole('button', { name: /copy note path/i }))

    expect(writeText).toHaveBeenCalledWith('ideas/alpha.md')
  })

  it('enters explicit-save Markdown editing mode with the exact source', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    fireEvent.click(screen.getByRole('button', { name: /edit note/i }))

    expect(screen.getByRole('textbox', { name: /markdown editor/i })).toHaveValue(
      '# Alpha\n\nSee [[beta]] and [Roadmap Doc](../projects/roadmap.md).',
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('saves the exact Markdown source with the raw revision and refreshes the route', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          updated: true,
          note: {
            ...buildBrowseFixture().note,
            rawMarkdown: '# Alpha\n\nEdited.',
            rawContentHash: 'edited-raw-hash',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)
    fireEvent.click(screen.getByRole('button', { name: /edit note/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /markdown editor/i }), { target: { value: '# Alpha\n\nEdited.' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await screen.findByRole('button', { name: /edit note/i })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vault/notes/by-path',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          path: 'ideas/alpha.md',
          rawMarkdown: '# Alpha\n\nEdited.',
          expectedRawContentHash: 'alpha-raw-hash',
        }),
      }),
    )
  })

  it('keeps the draft visible when the raw revision is stale', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Note changed since it was read; retry with the latest rawContentHash' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    )
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          note: {
            rawMarkdown: '# Alpha\n\nLatest from agent.',
            rawContentHash: 'latest-raw-hash',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)
    fireEvent.click(screen.getByRole('button', { name: /edit note/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /markdown editor/i }), { target: { value: '# Alpha\n\nDraft survives.' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText(/changed since it was read/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /markdown editor/i })).toHaveValue('# Alpha\n\nDraft survives.')

    fireEvent.click(screen.getByRole('button', { name: /reload latest/i }))

    expect(await screen.findByRole('textbox', { name: /markdown editor/i })).toHaveValue('# Alpha\n\nLatest from agent.')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  it('renders internal wiki and markdown note links as app navigation links', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    expect(screen.getByRole('link', { name: 'beta' }).getAttribute('href')).toContain('folder=ideas')
    expect(screen.getByRole('link', { name: 'Roadmap Doc' }).getAttribute('href')).toContain('folder=projects')
  })

  it('renders a token-backed page as read-only and preserves the token across navigation', () => {
    const browse = buildBrowseFixture()
    browse.note.body += '\n\n[Non-accessible link](#nabu-inaccessible-1)\n\n![diagram](diagram.png)'
    browse.note.rawMarkdown = browse.note.body
    browse.note.outgoingLinks.push({
      raw: '[Non-accessible link](#nabu-inaccessible-1)',
      kind: 'markdown',
      text: 'Non-accessible link',
      target: 'inaccessible',
      resolved: false,
      targetRelPath: null,
      targetSlug: null,
      inaccessible: true,
    })

    const { container } = render(
      <HomePage browse={browse} search={null} searchPathInput="" searchTagInput="" shareToken="read-secret" />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/read-only shared space/i)
    expect(screen.queryByRole('button', { name: /edit note/i })).not.toBeInTheDocument()
    expect(screen.getByText('Non-accessible link')).toBeInTheDocument()
    expect(JSON.parse(screen.getAllByRole('link', { name: '#ai' })[0].getAttribute('data-search-value') ?? '{}')).toMatchObject({
      token: 'read-secret',
    })
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/vault/assets?path=ideas%2Fdiagram.png&token=read-secret')
    expect(screen.queryByRole('link', { name: 'settings' })).not.toBeInTheDocument()
  })

  it('does not fetch external images from a token-backed page', () => {
    const browse = buildBrowseFixture()
    browse.note.body += '\n\n![remote](https://example.com/remote.png)'
    browse.note.rawMarkdown = browse.note.body

    const { container } = render(
      <HomePage browse={browse} search={null} searchPathInput="" searchTagInput="" shareToken="read-secret" />,
    )

    expect(screen.getByText('remote')).toBeInTheDocument()
    expect(container.querySelector('img[src="https://example.com/remote.png"]')).not.toBeInTheDocument()
  })

  it('reveals note details, metadata, backlinks, outgoing links, and related notes in the details drawer', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    fireEvent.click(screen.getByRole('button', { name: /details/i }))

    expect(screen.getByText(/metadata/i)).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('https://usedocsyde.com')).toBeInTheDocument()
    expect(screen.getByText(/linked from/i)).toBeInTheDocument()
    expect(screen.getAllByText(/resolved outgoing/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Roadmap Doc' })).toBeInTheDocument()
    expect(screen.getAllByText(/unresolved links/i).length).toBeGreaterThan(0)
    expect(screen.getByText('[[missing-note]]')).toBeInTheDocument()
    expect(screen.getByText(/related/i)).toBeInTheDocument()
    expect(screen.getByText('draft')).toBeInTheDocument()
  })

  it('renders note tags as functional search links', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    const tagLink = screen.getAllByRole('link', { name: '#ai' })[0]
    expect(JSON.parse(tagLink.getAttribute('data-search-value') ?? '{}')).toMatchObject({
      folder: 'ideas',
      note: 'alpha',
      q: '',
      searchPath: 'ideas',
      searchTag: 'ai',
    })
  })

  it('renders search results when query is present', () => {
    render(
      <HomePage
        browse={buildBrowseFixture()}
        search={{
          query: 'agent memory',
          normalizedQuery: 'agent memory',
          exactPhrases: [],
          tokens: ['agent', 'memory'],
          path: 'ideas',
          tag: null,
          limit: 20,
          offset: 0,
          total: 1,
          hasMore: false,
          results: [
            {
              id: 'ideas/alpha.md',
              relPath: 'ideas/alpha.md',
              slug: 'alpha',
              title: 'Alpha',
              summary: null,
              tags: ['ai'],
              score: 140,
              reasons: ['title-exact', 'phrase'],
              snippet: '... agent memory ...',
            },
          ],
        }}
        searchPathInput="ideas"
        searchTagInput=""
      />,
    )

    expect(screen.getByRole('heading', { name: /search/i })).toBeInTheDocument()
    expect(screen.getAllByText('ideas/alpha.md').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('... agent memory ...')).toBeInTheDocument()
    expect(screen.getByText('title-exact, phrase')).toBeInTheDocument()
  })

  it('navigates search submissions without a document reload', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="ideas" searchTagInput="ai" />)

    fireEvent.change(screen.getByRole('textbox', { name: /search vault/i }), { target: { value: 'agent memory' } })
    const form = screen.getByRole('button', { name: 'search' }).closest('form')

    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    expect(navigate).toHaveBeenCalledWith({
      to: '/',
      search: {
        folder: 'ideas',
        note: 'alpha',
        q: 'agent memory',
        searchPath: 'ideas',
        searchTag: 'ai',
      },
    })
  })

  it('shows a clear control to return to browse mode', () => {
    render(
      <HomePage
        browse={buildBrowseFixture()}
        search={{
          query: 'agent',
          normalizedQuery: 'agent',
          exactPhrases: [],
          tokens: ['agent'],
          path: '',
          tag: null,
          limit: 20,
          offset: 0,
          total: 0,
          hasMore: false,
          results: [],
        }}
        searchPathInput=""
        searchTagInput=""
      />,
    )

    expect(screen.getByRole('link', { name: /clear/i })).toBeInTheDocument()
  })

  it('clears search state when navigating from search results to a note', () => {
    render(
      <HomePage
        browse={buildBrowseFixture()}
        search={{
          query: 'agent memory',
          normalizedQuery: 'agent memory',
          exactPhrases: [],
          tokens: ['agent', 'memory'],
          path: 'ideas',
          tag: null,
          limit: 20,
          offset: 0,
          total: 1,
          hasMore: false,
          results: [
            {
              id: 'ideas/alpha.md',
              relPath: 'ideas/alpha.md',
              slug: 'alpha',
              title: 'Alpha',
              summary: null,
              tags: ['ai'],
              score: 140,
              reasons: ['title-exact', 'phrase'],
              snippet: '... agent memory ...',
            },
          ],
        }}
        searchPathInput="ideas"
        searchTagInput=""
      />,
    )

    const resultLink = screen.getByRole('link', { name: 'Alpha' })
    expect(JSON.parse(resultLink.getAttribute('data-search-value') ?? '{}')).toMatchObject({
      folder: 'ideas',
      note: 'alpha',
      q: '',
      searchPath: '',
      searchTag: '',
    })
  })

  it('clears search state when selecting a folder from the tree', () => {
    render(
      <HomePage
        browse={buildBrowseFixture()}
        search={{
          query: 'agent',
          normalizedQuery: 'agent',
          exactPhrases: [],
          tokens: ['agent'],
          path: 'ideas',
          tag: null,
          limit: 20,
          offset: 0,
          total: 0,
          hasMore: false,
          results: [],
        }}
        searchPathInput="ideas"
        searchTagInput=""
      />,
    )

    const folderLink = screen.getByRole('link', { name: /ideas/i })
    expect(JSON.parse(folderLink.getAttribute('data-search-value') ?? '{}')).toMatchObject({
      folder: 'ideas',
      note: '',
      q: '',
      searchPath: '',
      searchTag: '',
    })
  })

  it('shows an empty folder message when no notes are available', () => {
    render(
      <HomePage
        browse={{
          ...buildBrowseFixture(),
          folder: {
            path: 'ideas/empty',
            name: 'empty',
            folders: [],
            notes: [],
          },
          selectedNoteSlug: null,
          note: null,
          noteNeighborhood: null,
        }}
        search={null}
        searchPathInput=""
        searchTagInput=""
      />,
    )

    expect(screen.getByText('No notes in this folder yet.')).toBeInTheDocument()
  })

  it('renders an optional tag filter input', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="ai" />)

    expect(screen.getByLabelText(/tag filter/i)).toHaveValue('ai')
  })
})
