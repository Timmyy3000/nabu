// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getAgentBootstrapContract } from '../lib/agent/bootstrap'
import { AgentsPage } from './agents'

describe('AgentsPage', () => {
  it('renders agent onboarding content and real retrieval surfaces for authenticated users', () => {
    render(<AgentsPage authenticated={true} />)

    expect(screen.getByRole('heading', { name: '/agents.md' })).toBeInTheDocument()
    expect(screen.getByText(/starting point for agents/i)).toBeInTheDocument()

    expect(screen.getByText('GET /api/vault/')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/index/stats')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/tree')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/folders?path=')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/notes/$slug')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/notes/by-path?path=')).toBeInTheDocument()
    expect(screen.getByText('GET /api/vault/search?q=&path=&tag=&limit=&offset=')).toBeInTheDocument()
  })

  it('renders the same bootstrap identity guidance exposed by the public contract when unauthenticated', () => {
    const bootstrap = getAgentBootstrapContract()

    render(<AgentsPage authenticated={false} />)

    expect(screen.getByRole('heading', { name: '/agents.md' })).toBeInTheDocument()
    expect(screen.getByText('POST /api/auth/login')).toBeInTheDocument()
    expect(screen.getByText(/application\/x-www-form-urlencoded/i)).toBeInTheDocument()
    expect(screen.getByText(/nabu_session/i)).toBeInTheDocument()
    expect(screen.getByText(bootstrap.identity.note)).toBeInTheDocument()
    expect(screen.getByText(bootstrap.identity.deterministicRead)).toBeInTheDocument()
    expect(screen.getByText(bootstrap.identity.convenienceRead)).toBeInTheDocument()
    expect(screen.queryByText('GET /api/vault/tree')).not.toBeInTheDocument()
  })
})
