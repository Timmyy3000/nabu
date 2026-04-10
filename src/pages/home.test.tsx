// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './home'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: ComponentProps<'a'>) => <a {...props}>{children}</a>,
}))

describe('HomePage', () => {
  it('renders folder navigation, note list, and markdown content', () => {
    render(
      <HomePage
        browse={{
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
        }}
      />,
    )

    expect(screen.getByRole('heading', { name: /knowledge vault/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /ideas/i })).toBeInTheDocument()
    expect(screen.getByText('ideas/alpha.md')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument()
  })
})
