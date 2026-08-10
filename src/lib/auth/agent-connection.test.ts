import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { hashSecret } from '../shared-spaces/crypto'
import { __resetSharedSpaceServiceForTests } from '../shared-spaces/service'
import { __resetSharedSpaceStoreForTests, getSharedSpaceStore } from '../shared-spaces/store'
import {
  AGENT_CONNECTION_TTL_MS,
  AgentConnectionError,
  AgentConnectionService,
} from './agent-connection'

const originalKnowledgePath = process.env.KNOWLEDGE_PATH
const originalDataPath = process.env.NABU_DATA_PATH
const roots: string[] = []

afterEach(async () => {
  process.env.KNOWLEDGE_PATH = originalKnowledgePath
  process.env.NABU_DATA_PATH = originalDataPath
  __resetSharedSpaceStoreForTests()
  __resetSharedSpaceServiceForTests()
  await Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

async function fixture() {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-agent-connection-data-'))
  roots.push(dataRoot)
  process.env.NABU_DATA_PATH = dataRoot
  delete process.env.KNOWLEDGE_PATH
  __resetSharedSpaceStoreForTests()
}

function secretFromUrl(connectionUrl: string): string {
  return new URL(connectionUrl).pathname.split('/').at(-1)!
}

describe('owner agent connection service', () => {
  it('issues a short-lived hash-only connection capability with a precise redemption contract', async () => {
    await fixture()
    const service = new AgentConnectionService({ now: () => 1_000, baseUrl: 'https://nabu.example/base' })

    const result = await service.issueConnection({ ownerPrincipalId: 'owner', permissions: ['write', 'read'] })

    expect(result).toMatchObject({
      permissions: ['read', 'write'],
      expiresAt: new Date(1_000 + AGENT_CONNECTION_TTL_MS).toISOString(),
      redemption: {
        endpoint: '/base/api/agent/connections/redeem',
        method: 'POST',
        bodyField: 'connectionUrl',
        nextAction: 'redeem_and_save_credential',
      },
    })
    expect(result.connectionUrl).toMatch(/^https:\/\/nabu\.example\/base\/connect\/agent\/[A-Za-z0-9_-]+$/)

    const secret = secretFromUrl(result.connectionUrl)
    const record = (await getSharedSpaceStore()).getOwnerAgentConnectionForTest(hashSecret(secret))
    expect(record).toMatchObject({
      ownerPrincipalId: 'owner',
      permissions: ['read', 'write'],
      expiresAt: 1_000 + AGENT_CONNECTION_TTL_MS,
      consumedAt: null,
    })
    expect(record?.tokenHash).not.toContain(secret)
  })

  it('rejects invalid permission sets before creating a capability', async () => {
    await fixture()
    const service = new AgentConnectionService({ now: () => 1_000, baseUrl: 'https://nabu.example' })

    await expect(service.issueConnection({ ownerPrincipalId: 'owner', permissions: [] })).rejects.toMatchObject({
      code: 'AGENT_CONNECTION_PERMISSIONS_INVALID',
      status: 400,
    })
    await expect(service.issueConnection({ ownerPrincipalId: 'owner', permissions: ['write'] })).rejects.toBeInstanceOf(AgentConnectionError)
  })

  it('redeems exactly once and returns a durable credential without storing its raw value', async () => {
    await fixture()
    const service = new AgentConnectionService({ now: () => 1_000, baseUrl: 'https://nabu.example' })
    const issued = await service.issueConnection({ ownerPrincipalId: 'owner', permissions: ['read'] })

    const redeemed = await service.redeemConnection({ connectionUrl: issued.connectionUrl })

    expect(redeemed).toMatchObject({
      permissions: ['read'],
      apiBaseUrl: 'https://nabu.example',
      nextAction: 'configure_agent',
      createdAt: new Date(1_000).toISOString(),
    })
    expect(redeemed.credential).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(redeemed.credential).not.toContain(issued.connectionUrl)
    await expect(service.redeemConnection({ connectionUrl: issued.connectionUrl })).rejects.toMatchObject({
      code: 'AGENT_CONNECTION_INVALID',
      status: 410,
    })

    const store = await getSharedSpaceStore()
    const connection = store.getOwnerAgentConnectionForTest(hashSecret(secretFromUrl(issued.connectionUrl)))
    const credential = store.getOwnerAgentCredentialForTest(hashSecret(redeemed.credential))
    expect(connection).toMatchObject({ consumedAt: 1_000, credentialId: credential?.id })
    expect(credential).toMatchObject({ permissions: ['read'], revokedAt: null, lastUsedAt: null })
    expect(credential?.tokenHash).not.toContain(redeemed.credential)
  })

  it('does not allow an expired or malformed connection URL to redeem', async () => {
    await fixture()
    let now = 1_000
    const service = new AgentConnectionService({ now: () => now, baseUrl: 'https://nabu.example' })
    const issued = await service.issueConnection({ ownerPrincipalId: 'owner', permissions: ['read', 'write'] })

    now += AGENT_CONNECTION_TTL_MS
    await expect(service.redeemConnection({ connectionUrl: issued.connectionUrl })).rejects.toMatchObject({
      code: 'AGENT_CONNECTION_INVALID',
      status: 410,
    })
    await expect(service.redeemConnection({ connectionUrl: 'https://nabu.example/connect/agent/not-a-real-link' })).rejects.toMatchObject({
      code: 'AGENT_CONNECTION_INVALID',
      status: 410,
    })
  })

  it('allows only one successful result when redemption races', async () => {
    await fixture()
    const service = new AgentConnectionService({ now: () => 1_000, baseUrl: 'https://nabu.example' })
    const issued = await service.issueConnection({ ownerPrincipalId: 'owner', permissions: ['read', 'write'] })

    const outcomes = await Promise.allSettled(
      Array.from({ length: 8 }, () => service.redeemConnection({ connectionUrl: issued.connectionUrl })),
    )
    const successes = outcomes.filter((outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof service.redeemConnection>>> => outcome.status === 'fulfilled')
    const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected')

    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(7)
    expect(failures.every((failure) => failure.reason.code === 'AGENT_CONNECTION_INVALID')).toBe(true)
  })
})
