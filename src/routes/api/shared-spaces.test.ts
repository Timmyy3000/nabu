import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AUTH_COOKIE_NAME, createSessionToken } from '../../lib/auth/session'
import { __resetSharedSpaceServiceForTests } from '../../lib/shared-spaces/service'
import { Route as ProposalsRoute } from './shared-spaces/proposals'
import { Route as SpacesRoute } from './shared-spaces/index'
import { Route as ExtendRoute } from './shared-spaces/$sharedSpaceId/extend'
import { Route as RedeemRoute } from './shared-spaces/invites/redeem'
import { Route as ReadLinkRoute } from './shared-spaces/$sharedSpaceId/read-link'

const originalKnowledgePath = process.env.KNOWLEDGE_PATH
const originalDataPath = process.env.NABU_DATA_PATH
const originalPassword = process.env.NABU_PASSWORD
const originalPublicUrl = process.env.NABU_PUBLIC_URL
const roots: string[] = []

afterEach(async () => {
  process.env.KNOWLEDGE_PATH = originalKnowledgePath
  process.env.NABU_DATA_PATH = originalDataPath
  process.env.NABU_PASSWORD = originalPassword
  if (originalPublicUrl === undefined) delete process.env.NABU_PUBLIC_URL
  else process.env.NABU_PUBLIC_URL = originalPublicUrl
  __resetSharedSpaceServiceForTests()
  await Promise.allSettled(roots.map((root) => rm(root, { recursive: true, force: true })))
  roots.length = 0
})

async function fixture() {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-shared-route-vault-'))
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'nabu-shared-route-data-'))
  roots.push(vaultRoot, dataRoot)
  await mkdir(path.join(vaultRoot, 'little-helpers'), { recursive: true })
  await writeFile(path.join(vaultRoot, 'little-helpers', 'readme.md'), '# Helpers')
  process.env.KNOWLEDGE_PATH = vaultRoot
  process.env.NABU_DATA_PATH = dataRoot
  process.env.NABU_PASSWORD = 'test-password'
  __resetSharedSpaceServiceForTests()
}

function ownerHeaders() {
  return { cookie: `${AUTH_COOKIE_NAME}=${encodeURIComponent(createSessionToken())}` }
}

describe('shared-space HTTP API', () => {
  it('previews, explicitly confirms, lists, and redeems through agent-facing routes', async () => {
    await fixture()

    const proposalHandler = ProposalsRoute.options.server!.handlers!.POST
    const proposalResponse = await proposalHandler({
      request: new Request('http://localhost:3000/api/shared-spaces/proposals', {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'little-helpers', durationDays: 14 }),
      }),
    })
    const proposal = await proposalResponse.json()
    expect(proposalResponse.status).toBe(201)
    expect(proposal.liveRecursiveScope).toBe(true)

    const spacesHandler = SpacesRoute.options.server!.handlers!
    const unconfirmed = await spacesHandler.POST({
      request: new Request('http://localhost:3000/api/shared-spaces', {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.proposalId, confirmed: false, durationDays: 14 }),
      }),
    })
    expect(unconfirmed.status).toBe(400)
    expect((await unconfirmed.json()).code).toBe('SHARED_SPACE_CONFIRMATION_REQUIRED')

    const confirmed = await spacesHandler.POST({
      request: new Request('http://localhost:3000/api/shared-spaces', {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.proposalId, confirmed: true, durationDays: 1 }),
      }),
    })
    const invite = await confirmed.json()
    expect(confirmed.status).toBe(201)
    expect(invite.inviteUsesRemaining).toBe(1)

    const extended = await ExtendRoute.options.server!.handlers!.POST({
      request: new Request(`http://localhost:3000/api/shared-spaces/${invite.sharedSpaceId}/extend`, {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ confirmed: true }),
      }),
      params: { sharedSpaceId: invite.sharedSpaceId },
    })
    expect(extended.status).toBe(200)
    expect((await extended.json()).sharedSpaceExpiresAt).toEqual(expect.any(String))

    const listed = await spacesHandler.GET({ request: new Request('http://localhost:3000/api/shared-spaces', { headers: ownerHeaders() }) })
    expect((await listed.json()).spaces).toHaveLength(1)

    const redeemHandler = RedeemRoute.options.server!.handlers!.POST
    const redeemed = await redeemHandler({
      request: new Request('http://localhost:3000/api/shared-spaces/invites/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteUrl: invite.inviteUrl }),
      }),
    })
    const token = await redeemed.json()
    expect(redeemed.status).toBe(200)
    expect(token.accessToken).toEqual(expect.any(String))

    const reused = await redeemHandler({
      request: new Request('http://localhost:3000/api/shared-spaces/invites/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteUrl: invite.inviteUrl }),
      }),
    })
    expect(reused.status).toBe(410)
  })

  it('issues and revokes the exact owner-only read-link contract', async () => {
    await fixture()
    const proposalResponse = await ProposalsRoute.options.server!.handlers!.POST({
      request: new Request('http://localhost:3000/api/shared-spaces/proposals', {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'little-helpers' }),
      }),
    })
    const proposal = await proposalResponse.json()
    const spaceResponse = await SpacesRoute.options.server!.handlers!.POST({
      request: new Request('http://localhost:3000/api/shared-spaces', {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.proposalId, confirmed: true, durationDays: 183 }),
      }),
    })
    const space = await spaceResponse.json()
    const handlers = ReadLinkRoute.options.server!.handlers!

    const invalid = await handlers.POST({
      request: new Request(`http://localhost:3000/api/shared-spaces/${space.sharedSpaceId}/read-link`, {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ durationDays: 184 }),
      }),
      params: { sharedSpaceId: space.sharedSpaceId },
    })
    expect(invalid.status).toBe(400)

    const issued = await handlers.POST({
      request: new Request(`http://localhost:3000/api/shared-spaces/${space.sharedSpaceId}/read-link`, {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ durationDays: 7 }),
      }),
      params: { sharedSpaceId: space.sharedSpaceId },
    })
    const payload = await issued.json()
    expect(issued.status).toBe(201)
    expect(payload).toMatchObject({
      sharedSpaceId: space.sharedSpaceId,
      rootPath: 'little-helpers',
      permission: 'read',
      durationDays: 7,
      expiresAt: expect.any(String),
      shareUrl: expect.stringContaining('token='),
    })

    const revoked = await handlers.DELETE({
      request: new Request(`http://localhost:3000/api/shared-spaces/${space.sharedSpaceId}/read-link`, {
        method: 'DELETE',
        headers: ownerHeaders(),
      }),
      params: { sharedSpaceId: space.sharedSpaceId },
    })
    expect(revoked.status).toBe(204)
    expect(await revoked.text()).toBe('')
    const repeated = await handlers.DELETE({
      request: new Request(`http://localhost:3000/api/shared-spaces/${space.sharedSpaceId}/read-link`, {
        method: 'DELETE',
        headers: ownerHeaders(),
      }),
      params: { sharedSpaceId: space.sharedSpaceId },
    })
    expect(repeated.status).toBe(204)
  })

  it('uses the configured canonical public URL instead of a hostile request origin', async () => {
    await fixture()
    process.env.NABU_PUBLIC_URL = 'https://trusted.example/base'
    const proposalHandler = ProposalsRoute.options.server!.handlers!.POST
    const proposalResponse = await proposalHandler({
      request: new Request('https://evil.example/api/shared-spaces/proposals', {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'little-helpers', contractVersion: 2, durationDays: 7, permissions: ['read'] }),
      }),
    })
    const proposal = await proposalResponse.json()
    const confirmed = await SpacesRoute.options.server!.handlers!.POST({
      request: new Request('https://evil.example/api/shared-spaces', {
        method: 'POST',
        headers: { ...ownerHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: proposal.proposalId, confirmed: true, contractVersion: 2, durationDays: 7, permissions: ['read'] }),
      }),
    })
    const invite = await confirmed.json()
    expect(confirmed.status).toBe(201)
    expect(invite.inviteUrl).toMatch(/^https:\/\/trusted\.example\/base\/invites\//)
    expect(invite.inviteUrl).not.toContain('evil.example')
  })
})
