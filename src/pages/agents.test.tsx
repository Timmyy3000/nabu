// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentsPage } from './agents'

describe('AgentsPage', () => {
  it('renders agent onboarding content and real retrieval surfaces', () => {
    render(<AgentsPage />)

    expect(screen.getByRole('heading', { name: '/agents.md' })).toBeInTheDocument()
    expect(screen.getByText(/starting point for agents/i)).toBeInTheDocument()

    expect(screen.getByText('GET /api/vault/')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/index/stats')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/tree')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/folders?path=')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/notes/$slug')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/notes/by-path?path=')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/search?q=&path=&limit=&offset=')).toBeInTheDocument()
  })
})
