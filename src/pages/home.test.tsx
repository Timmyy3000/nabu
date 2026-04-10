// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './home'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search, ...props }: ComponentProps<'a'> & { to?: string; search?: unknown }) => {
    const href = typeof to === 'string' ? to : '/'
    return (
      <a {...props} href={href} data-search={typeof search === 'function' ? 'fn' : undefined}>
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
    render(<HomePage browse={buildBrowseFixture()} search={null} searchPathInput="" />)

    expect(screen.getByRole('heading', { name: /knowledge vault/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /ideas/i })).toBeInTheDocument()
    expect(screen.getByText('ideas/alpha.md')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
  })

  it('renders search results when query is present', () => {
    render(
      <HomePage
        browse={buildBrowseFixture()}
        search={{
          query: 'agent memory',
          normalizedQuery: 'agent memory',
          path: 'ideas',
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
          path: '',
          limit: 20,
          offset: 0,
          total: 0,
          hasMore: false,
          results: [],
        }}
        searchPathInput=""
      />,
    )

    expect(screen.getByRole('link', { name: /clear/i })).toBeInTheDocument()
  })
})
