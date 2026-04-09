// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HomePage } from './home'

describe('HomePage', () => {
  it('renders the core product framing', () => {
    render(<HomePage />)

    expect(
      screen.getByRole('heading', {
        name: /nabu is obsidian-on-the-web for humans and agents/i,
      }),
    ).toBeInTheDocument()

    expect(screen.getByText(/markdown files are the source of truth/i)).toBeInTheDocument()
    expect(screen.getByText(/filesystem-backed note browsing/i)).toBeInTheDocument()
  })
})
