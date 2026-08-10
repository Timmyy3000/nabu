import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { SharedSpacePermission } from '../lib/shared-spaces/types'

type AgentPermission = SharedSpacePermission
type PermissionChoice = 'read' | 'read-write'

type AgentConnectionRedemption = {
  endpoint: string
  method: 'POST'
  bodyField: 'connectionUrl'
  expiresAt: string
  nextAction: 'redeem_and_save_credential'
}

type AgentConnection = {
  connectionUrl: string
  permissions: AgentPermission[]
  expiresAt: string
  redemption: AgentConnectionRedemption
}

type AgentConnectionError = {
  message: string
  unauthorized: boolean
}

const PERMISSION_OPTIONS: Array<{
  value: PermissionChoice
  label: string
  description: string
}> = [
  {
    value: 'read',
    label: 'read only',
    description: 'Browse and search the whole vault without changing notes.',
  },
  {
    value: 'read-write',
    label: 'read and write',
    description: 'Browse, search, create, and update notes across the whole vault.',
  },
]

function permissionsForChoice(choice: PermissionChoice): AgentPermission[] {
  return choice === 'read' ? ['read'] : ['read', 'write']
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isSafeConnectionUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    )
  } catch {
    return false
  }
}

function isAgentConnection(value: unknown): value is AgentConnection {
  if (!isRecord(value) || !isSafeConnectionUrl(value.connectionUrl) || typeof value.expiresAt !== 'string') {
    return false
  }

  if (
    !Array.isArray(value.permissions) ||
    value.permissions.length < 1 ||
    value.permissions.length > 2 ||
    !value.permissions.includes('read') ||
    !value.permissions.every((permission) => permission === 'read' || permission === 'write')
  ) {
    return false
  }

  const redemption = value.redemption
  return (
    isRecord(redemption) &&
    redemption.method === 'POST' &&
    redemption.bodyField === 'connectionUrl' &&
    typeof redemption.endpoint === 'string' &&
    typeof redemption.expiresAt === 'string' &&
    redemption.nextAction === 'redeem_and_save_credential'
  )
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error
  }

  return fallback
}

function permissionSummary(permissions: AgentPermission[]): string {
  return permissions.join(', ')
}

export function AgentSettingsPage() {
  const [permissionChoice, setPermissionChoice] = useState<PermissionChoice>('read')
  const [connection, setConnection] = useState<AgentConnection | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<AgentConnectionError | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  async function createConnection() {
    if (isCreating) {
      return
    }

    setIsCreating(true)
    setConnection(null)
    setError(null)
    setCopyState('idle')

    try {
      const response = await fetch('/api/agent/connections', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ permissions: permissionsForChoice(permissionChoice) }),
      })
      const payload = (await response.json().catch(() => null)) as unknown

      if (!response.ok) {
        setError({
          message: response.status === 401
            ? 'Your session has expired. Sign in again before generating an agent link.'
            : getErrorMessage(payload, 'Nabu could not generate an agent link. Try again.'),
          unauthorized: response.status === 401,
        })
        return
      }

      if (!isAgentConnection(payload)) {
        setError({
          message: 'Nabu returned an incomplete connection response. Try again.',
          unauthorized: false,
        })
        return
      }

      setConnection(payload)
    } catch {
      setError({
        message: 'Nabu could not generate an agent link. Check the connection and try again.',
        unauthorized: false,
      })
    } finally {
      setIsCreating(false)
    }
  }

  async function copyConnectionLink() {
    if (!connection) {
      return
    }

    try {
      if (!navigator.clipboard) {
        throw new Error('Clipboard API unavailable')
      }

      await navigator.clipboard.writeText(connection.connectionUrl)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    }
  }

  function startAnotherConnection() {
    setConnection(null)
    setError(null)
    setCopyState('idle')
  }

  return (
    <section className="route-page agent-settings-page">
      <div className="agent-settings-surface">
        <header className="agent-settings-header">
          <div>
            <div className="wordmark" aria-label="𒀭 nabu">
              <span className="wedge">𒀭</span>
              <span className="wordmark-text">nabu</span>
            </div>
            <p className="section-label agent-settings-kicker">settings / agents</p>
            <h1>connect an agent</h1>
            <p className="agent-settings-lede">
              Generate a short-lived link for an agent without sharing your owner password. The link exchanges for a durable credential once, with access limited to the permissions you choose.
            </p>
          </div>
          <Link to="/" search={{ folder: '', note: '', q: '', searchPath: '', searchTag: '' }} className="text-button agent-settings-back-link">
            back to vault
          </Link>
        </header>

        <div className="agent-settings-grid">
          <section className="agent-settings-card" aria-labelledby="agent-permissions-heading">
            <p className="section-label">permission</p>
            <h2 id="agent-permissions-heading">Choose what this agent can do</h2>
            <p className="agent-settings-copy">The first release grants whole-vault access. You can choose read-only or read/write access for this connection.</p>

            <div className="agent-permission-options" role="radiogroup" aria-label="Agent permissions">
              {PERMISSION_OPTIONS.map((option) => (
                <label key={option.value} className={permissionChoice === option.value ? 'agent-permission-option is-selected' : 'agent-permission-option'}>
                  <input
                    type="radio"
                    name="agent-permissions"
                    value={option.value}
                    checked={permissionChoice === option.value}
                    onChange={() => setPermissionChoice(option.value)}
                    disabled={isCreating}
                  />
                  <span className="agent-permission-option-body">
                    <span className="agent-permission-option-heading">{option.label}</span>
                    <span className="agent-permission-option-description">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>

            <p className="agent-settings-note">
              The generated URL is a secret capability. Share it only with the agent you intend to connect, and generate a new one if it expires or is used.
            </p>
            <button type="button" className="ui-button agent-generate-button" onClick={() => void createConnection()} disabled={isCreating} aria-busy={isCreating}>
              {isCreating ? 'generating…' : 'generate connection link'}
            </button>
            {isCreating ? <p className="agent-settings-status" role="status">Generating a secure one-time connection link…</p> : null}
          </section>

          <section className="agent-settings-card agent-result-card" aria-live="polite">
            {error ? (
              <div className="agent-connection-error" role="alert">
                <p className="section-label">unable to connect</p>
                <h2>{error.unauthorized ? 'Sign in to generate a link' : 'Connection link not generated'}</h2>
                <p>{error.message}</p>
                {error.unauthorized ? (
                  <Link to="/login" search={{ redirect: '/settings/agents', error: '' }} className="ui-button agent-error-action">
                    sign in again
                  </Link>
                ) : null}
              </div>
            ) : connection ? (
              <div className="agent-connection-success">
                <p className="section-label agent-success-label">link ready</p>
                <h2>Hand this link to your agent</h2>
                <p className="agent-settings-copy">The link is one-time and expires soon. Opening it is safe; redemption happens only when the agent sends the explicit POST request described on the handoff page.</p>

                <div className="agent-link-control">
                  <label htmlFor="agent-connection-link">one-time connection URL</label>
                  <div className="agent-link-input-row">
                    <input id="agent-connection-link" type="text" value={connection.connectionUrl} readOnly spellCheck={false} />
                    <button type="button" className="ui-button" onClick={() => void copyConnectionLink()} aria-label="Copy connection link">
                      copy
                    </button>
                  </div>
                  <p className="agent-copy-status" role="status" aria-live="polite">
                    {copyState === 'copied' ? 'Copied connection link.' : copyState === 'error' ? 'Copy failed. Select the link and copy it manually.' : ''}
                  </p>
                </div>

                <dl className="agent-connection-meta">
                  <div>
                    <dt>permissions</dt>
                    <dd>{permissionSummary(connection.permissions)}</dd>
                  </div>
                  <div>
                    <dt>expires</dt>
                    <dd><time dateTime={connection.expiresAt}>{connection.expiresAt}</time></dd>
                  </div>
                </dl>

                <div className="agent-connection-actions">
                  <a href={connection.connectionUrl} target="_blank" rel="noopener noreferrer" className="ui-button agent-open-link">
                    open in Codex
                  </a>
                  <button type="button" className="text-button" onClick={startAnotherConnection}>
                    generate another
                  </button>
                </div>

                <p className="agent-redemption-note">
                  Agent redemption: <code>{connection.redemption.method} {connection.redemption.endpoint}</code> with <code>{connection.redemption.bodyField}</code>. The response action is <code>{connection.redemption.nextAction}</code>.
                </p>
              </div>
            ) : (
              <div className="agent-result-empty">
                <p className="section-label">handoff</p>
                <h2>Your connection link will appear here</h2>
                <p className="agent-settings-copy">After generation, copy the one-time URL or open it in a new tab. The agent must redeem it with a POST before it expires.</p>
                <div className="agent-flow-hint" aria-label="Connection handoff steps">
                  <span><strong>01</strong> choose permissions</span>
                  <span><strong>02</strong> generate a link</span>
                  <span><strong>03</strong> hand it to your agent</span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
