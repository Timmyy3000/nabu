// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
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
          summary: null,
          tags: [],
          createdAt: null,
          updatedAt: null,
        },
      ],
    },
    selectedNoteSlug: 'alpha',
    note: {
      id: 'ideas/alpha.md',
      relPath: 'ideas/alpha.md',
      slug: 'alpha',
      title: 'alpha',
      summary: null,
      tags: [],
      createdAt: null,
      updatedAt: null,
      frontmatter: {},
      body: '# Alpha',
    },
  }
}

describe('HomePage', () => {
  it('renders browse UI when no query is active', () => {
    const { container } = render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" searchTagInput="" />)

    expect(screen.getByRole('heading', { name: /knowledge vault/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /ideas/i })).toBeInTheDocument()
    expect(screen.getByText('ideas/alpha.md')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
    expect(container.querySelector('.vault-workspace')).toBeTruthy()
    expect(container.querySelectorAll('.vault-pane')).toHaveLength(3)
    expect(container.querySelector('.vault-pane-note')).toBeTruthy()
    expect(screen.getByText('ideas/alpha.md').closest('.note-meta')).toBeTruthy()
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
    expect(screen.getAllByText('ideas/alpha.md')).toHaveLength(2)
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

    expect(screen.getByLabelText('Tag (optional)')).toHaveValue('ai')
  })
})
