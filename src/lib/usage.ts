import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import os from 'node:os'

const DEFAULT_URL = 'https://drain.drain.timi.click.sslip.io/v1/events'
const HEARTBEAT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

type UsageState = { instanceId: string; lastSentAt?: number }

function enabled() {
  const value = process.env.NABU_USAGE_REPORTING?.trim().toLowerCase()
  return value !== 'false' && value !== '0' && value !== 'off'
}

function statePath() {
  return process.env.NABU_USAGE_FILE?.trim() || join(process.env.HOME || '/tmp', '.config/nabu/drain.json')
}

async function loadState(): Promise<{ state: UsageState; firstRun: boolean }> {
  const path = statePath()
  try {
    const state = JSON.parse(await readFile(path, 'utf8')) as UsageState
    if (state.instanceId) return { state, firstRun: false }
  } catch {
    // First run or unreadable state.
  }
  const state = { instanceId: randomUUID() }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(state) + '\n', { mode: 0o600 })
  return { state, firstRun: true }
}

export async function reportUsage(): Promise<void> {
  if (!enabled()) return
  try {
    const { state, firstRun } = await loadState()
    const now = Date.now()
    if (!firstRun && state.lastSentAt && now - state.lastSentAt < HEARTBEAT_INTERVAL_MS) return
    const base = (process.env.DRAIN_URL?.trim() || DEFAULT_URL).replace(/\/$/, '')
    await fetch(`${base}/v1/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project: 'nabu',
        event: firstRun ? 'install' : 'heartbeat',
        event_id: randomUUID(),
        instance_id: state.instanceId,
        version: process.env.npm_package_version || '0.5.1',
        platform: os.platform(),
        runtime: 'bun',
      }),
      signal: AbortSignal.timeout(300),
    })
    state.lastSentAt = now
    await writeFile(statePath(), JSON.stringify(state) + '\n', { mode: 0o600 })
  } catch {
    // Usage reporting is best-effort and must never affect Nabu.
  }
}
