// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './home'

vi.mock('@tanstack/react-router', () => ({
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
      body: '# Alpha\n\nSee [[beta]] and [Roadmap](../projects/roadmap.md).',
      outgoingLinks: [
        {
          raw: '[[beta]]',
          kind: 'wiki',
          text: null,
          target: 'beta',
          resolved: true,
          targetRelPath: 'ideas/beta.md',
          targetSlug: 'beta',
        },
        {
          raw: '[Roadmap](../projects/roadmap.md)',
          kind: 'markdown',
          text: 'Roadmap',
          target: '../projects/roadmap.md',
          resolved: true,
          targetRelPath: 'projects/roadmap.md',
          targetSlug: 'roadmap',
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
        },
        {
          raw: '[Roadmap](../projects/roadmap.md)',
          kind: 'markdown',
          text: 'Roadmap',
          target: '../projects/roadmap.md',
          targetRelPath: 'projects/roadmap.md',
          targetSlug: 'roadmap',
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
        unresolvedOutgoingCount: 0,
      },
    },
  }
}

beforeEach(() => {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  writeText.mockClear()
})

describe('HomePage', () => {
  it('renders the redesigned browse UI when no query is active', () => {
    const { container } = render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    expect(screen.getByLabelText(/𒀭 nabu/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /ideas/i })).toBeInTheDocument()
    expect(screen.getAllByText('ideas/alpha.md').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('heading', { name: 'alpha' })).toBeInTheDocument()
    expect(screen.getAllByText('first real agent-driven session in nabu.').length).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('.vault-shell')).toBeTruthy()
    expect(container.querySelectorAll('.vault-pane')).toHaveLength(3)
    expect(container.querySelector('.vault-reader')).toBeTruthy()
  })

  it('copies the canonical note path when the path label is clicked', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    fireEvent.click(screen.getByRole('button', { name: /copy note path/i }))

    expect(writeText).toHaveBeenCalledWith('ideas/alpha.md')
  })

  it('renders internal wiki and markdown note links as app navigation links', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    expect(screen.getByRole('link', { name: 'beta' }).getAttribute('href')).toContain('folder=ideas')
    expect(screen.getByRole('link', { name: 'Roadmap' }).getAttribute('href')).toContain('folder=projects')
  })

  it('reveals note details, metadata, backlinks, outgoing links, and related notes in the details drawer', () => {
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    fireEvent.click(screen.getByRole('button', { name: /details/i }))

    expect(screen.getByText(/metadata/i)).toBeInTheDocument()
    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('https://usedocsyde.com')).toBeInTheDocument()
    expect(screen.getByText(/linked from/i)).toBeInTheDocument()
    expect(screen.getAllByText(/outgoing/i).length).toBeGreaterThan(0)
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
