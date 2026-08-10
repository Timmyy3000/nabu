// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentSettingsPage } from './agent-settings'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: ComponentProps<'a'> & { to?: string }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
}))

const fetchMock = vi.fn()
const writeText = vi.fn().mockResolvedValue(undefined)

const connectionResponse = {
  connectionUrl: 'https://nabu.example.test/connect/agent/opaque-secret',
  permissions: ['read', 'write'],
  expiresAt: '2026-08-10T12:10:00.000Z',
  redemption: {
    endpoint: '/api/agent/connections/redeem',
    method: 'POST',
    bodyField: 'connectionUrl',
    expiresAt: '2026-08-10T12:10:00.000Z',
    nextAction: 'redeem_and_save_credential',
  },
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  writeText.mockClear()
})

describe('AgentSettingsPage', () => {
  it('starts with read-only permission selected', () => {
    render(<AgentSettingsPage />)

    expect(screen.getByRole('radio', { name: /read only/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /read and write/i })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /generate connection link/i })).toBeInTheDocument()
  })

  it('posts the selected permissions and renders the returned link and expiry', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(connectionResponse), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<AgentSettingsPage />)
    fireEvent.click(screen.getByRole('radio', { name: /read and write/i }))
    fireEvent.click(screen.getByRole('button', { name: /generate connection link/i }))

    expect(await screen.findByDisplayValue(connectionResponse.connectionUrl)).toBeInTheDocument()
    expect(screen.getByText(connectionResponse.expiresAt)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agent/connections',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ permissions: ['read', 'write'] }),
      }),
    )
  })

  it('copies the generated URL and opens it safely', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(connectionResponse), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<AgentSettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /generate connection link/i }))
    await screen.findByDisplayValue(connectionResponse.connectionUrl)

    fireEvent.click(screen.getByRole('button', { name: /copy connection link/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(connectionResponse.connectionUrl))
    expect(screen.getByText(/copied/i)).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /open in codex/i })).toHaveAttribute('href', connectionResponse.connectionUrl)
    expect(screen.getByRole('link', { name: /open in codex/i })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: /open in codex/i })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('shows an accessible failure state when copying is unavailable', async () => {
    writeText.mockRejectedValueOnce(new Error('clipboard unavailable'))
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(connectionResponse), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<AgentSettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /generate connection link/i }))
    await screen.findByDisplayValue(connectionResponse.connectionUrl)

    fireEvent.click(screen.getByRole('button', { name: /copy connection link/i }))

    expect(await screen.findByText(/copy failed/i)).toBeInTheDocument()
  })

  it('presents an actionable message when the owner session is unauthorized', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<AgentSettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /generate connection link/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/session has expired/i)
    expect(screen.getByRole('link', { name: /sign in again/i })).toHaveAttribute('href', '/login')
  })
})
