// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentConnectionHandoffPage } from './$secret'

describe('agent connection handoff page', () => {
  it('explains explicit redemption without consuming or rendering the capability', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<AgentConnectionHandoffPage />)

    expect(screen.getByRole('heading', { name: /connect this agent to nabu/i })).toBeInTheDocument()
    expect(screen.getByText(/explicit post action/i)).toBeInTheDocument()
    expect(screen.getByText(/connectionUrl/i)).toBeInTheDocument()
    expect(screen.getByText(/expired or was already redeemed/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /read the agent contract/i })).toHaveAttribute('href', '/agents.md')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
