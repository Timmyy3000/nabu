import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite'
import type {
  OwnerAgentConnectionRecord,
  OwnerAgentCredentialInput,
  OwnerAgentCredentialRecord,
} from '../auth/types'
import type {
  SharedSpaceAccessTokenRecord,
  SharedSpaceInviteRecord,
  SharedSpacePermission,
  SharedSpaceProposalRecord,
  SharedSpaceReadLinkRecord,
  SharedSpaceRecord,
} from './types'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')

export const SHARED_SPACE_DATABASE_FILENAME = 'shared-spaces.sqlite'

type ProposalInput = Omit<SharedSpaceProposalRecord, 'consumedAt'>
type SpaceInput = SharedSpaceRecord
type InviteInput = SharedSpaceInviteRecord
type AccessTokenInput = SharedSpaceAccessTokenRecord
type OwnerAgentConnectionInput = OwnerAgentConnectionRecord
type ReadLinkInput = Pick<
  SharedSpaceReadLinkRecord,
  'id' | 'sharedSpaceId' | 'tokenHash' | 'createdAt' | 'expiresAt' | 'revokedAt'
>

export type SharedSpaceStore = {
  createProposal: (proposal: ProposalInput) => void
  getProposal: (id: string) => SharedSpaceProposalRecord | null
  consumeProposalAndCreateSpace: (input: {
    proposalId: string
    ownerPrincipalId: string
    now: number
    space: SpaceInput
    invite: InviteInput
  }) => { space: SharedSpaceRecord; invite: SharedSpaceInviteRecord } | null
  getSpace: (id: string) => SharedSpaceRecord | null
  listSpaces: (ownerPrincipalId: string) => SharedSpaceRecord[]
  createInvite: (invite: InviteInput) => void
  getInviteContext: (tokenHash: string) => { space: SharedSpaceRecord; invite: SharedSpaceInviteRecord } | null
  redeemInvite: (input: {
    tokenHash: string
    now: number
    principalId: string
    accessToken: AccessTokenInput
    idempotencyKeyHash?: string | null
  }) => { space: SharedSpaceRecord; invite: SharedSpaceInviteRecord } | null
  findAccessToken: (tokenHash: string, now: number) => SharedSpaceAccessTokenRecord | null
  touchAccessToken: (id: string, now: number) => void
  revokeSpace: (id: string, now: number) => boolean
  extendSpace: (id: string, expiresAt: number) => SharedSpaceRecord | null
  getAccessTokenForTest: (tokenHash: string) => SharedSpaceAccessTokenRecord | null
  rotateReadLink: (input: ReadLinkInput) => SharedSpaceReadLinkRecord
  findReadLink: (tokenHash: string, now: number) => SharedSpaceReadLinkRecord | null
  revokeReadLink: (sharedSpaceId: string, now: number) => boolean
  getReadLinkForTest: (sharedSpaceId: string) => SharedSpaceReadLinkRecord | null
  createOwnerAgentConnection: (connection: OwnerAgentConnectionInput) => void
  redeemOwnerAgentConnection: (input: {
    tokenHash: string
    now: number
    credential: OwnerAgentCredentialInput
  }) => { connection: OwnerAgentConnectionRecord; credential: OwnerAgentCredentialRecord } | null
  findOwnerAgentCredential: (tokenHash: string) => OwnerAgentCredentialRecord | null
  touchOwnerAgentCredential: (id: string, now: number) => void
  getOwnerAgentConnectionForTest: (tokenHash: string) => OwnerAgentConnectionRecord | null
  getOwnerAgentCredentialForTest: (tokenHash: string) => OwnerAgentCredentialRecord | null
  close: () => void
}

type SqlRow = Record<string, unknown>

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

function asNumber(value: unknown): number {
  return typeof value === 'bigint' ? Number(value) : Number(value)
}

function asNullableNumber(value: unknown): number | null {
  return value == null ? null : asNumber(value)
}

function asPermissions(value: unknown): SharedSpacePermission[] {
  try {
    const parsed = JSON.parse(asString(value)) as unknown
    if (!Array.isArray(parsed)) {
      return ['read']
    }

    return parsed.filter((entry): entry is SharedSpacePermission => entry === 'read' || entry === 'write')
  } catch {
    return ['read']
  }
}

function serializePermissions(permissions: SharedSpacePermission[]): string {
  return JSON.stringify(permissions)
}

function mapSpace(row: SqlRow): SharedSpaceRecord {
  return {
    id: asString(row.id),
    ownerPrincipalId: asString(row.owner_principal_id),
    rootPath: asString(row.root_path),
    permissions: asPermissions(row.permissions_json),
    createdAt: asNumber(row.created_at),
    expiresAt: asNumber(row.expires_at),
    revokedAt: asNullableNumber(row.revoked_at),
  }
}

function mapProposal(row: SqlRow): SharedSpaceProposalRecord {
  const contractVersion = asNumber(row.contract_version)
  return {
    id: asString(row.id),
    ownerPrincipalId: asString(row.owner_principal_id),
    rootPath: asString(row.root_path),
    preview: JSON.parse(asString(row.preview_json)) as SharedSpaceProposalRecord['preview'],
    createdAt: asNumber(row.created_at),
    expiresAt: asNumber(row.expires_at),
    consumedAt: asNullableNumber(row.consumed_at),
    contractVersion: contractVersion === 2 ? 2 : 1,
    requestedDurationDays: row.requested_duration_days == null ? null : asNumber(row.requested_duration_days),
    requestedPermissions: row.requested_permissions_json == null ? null : asPermissions(row.requested_permissions_json),
  }
}

function mapInvite(row: SqlRow): SharedSpaceInviteRecord {
  return {
    id: asString(row.id),
    sharedSpaceId: asString(row.shared_space_id),
    tokenHash: asString(row.token_hash),
    createdAt: asNumber(row.created_at),
    expiresAt: asNumber(row.expires_at),
    redeemedAt: asNullableNumber(row.redeemed_at),
    redeemedByPrincipalId: row.redeemed_by_principal_id == null ? null : asString(row.redeemed_by_principal_id),
    idempotencyKeyHash: row.idempotency_key_hash == null ? null : asString(row.idempotency_key_hash),
    accessTokenHash: row.access_token_hash == null ? null : asString(row.access_token_hash),
    accessTokenId: row.access_token_id == null ? null : asString(row.access_token_id),
  }
}

function mapAccessToken(row: SqlRow): SharedSpaceAccessTokenRecord {
  return {
    id: asString(row.id),
    sharedSpaceId: asString(row.shared_space_id),
    tokenHash: asString(row.token_hash),
    principalId: asString(row.principal_id),
    permissions: asPermissions(row.permissions_json),
    createdAt: asNumber(row.created_at),
    expiresAt: asNumber(row.expires_at),
    revokedAt: asNullableNumber(row.revoked_at),
    lastUsedAt: asNullableNumber(row.last_used_at),
    rootPath: asString(row.root_path),
    sharedSpaceExpiresAt: asNumber(row.space_expires_at),
    sharedSpaceRevokedAt: asNullableNumber(row.space_revoked_at),
  }
}

function mapReadLink(row: SqlRow): SharedSpaceReadLinkRecord {
  return {
    id: asString(row.id),
    sharedSpaceId: asString(row.shared_space_id),
    tokenHash: asString(row.token_hash),
    createdAt: asNumber(row.created_at),
    expiresAt: asNumber(row.expires_at),
    revokedAt: asNullableNumber(row.revoked_at),
    rootPath: asString(row.root_path),
    sharedSpaceExpiresAt: asNumber(row.space_expires_at),
    sharedSpaceRevokedAt: asNullableNumber(row.space_revoked_at),
  }
}

function mapOwnerAgentConnection(row: SqlRow): OwnerAgentConnectionRecord {
  return {
    id: asString(row.id),
    ownerPrincipalId: asString(row.owner_principal_id),
    tokenHash: asString(row.token_hash),
    permissions: asPermissions(row.permissions_json),
    createdAt: asNumber(row.created_at),
    expiresAt: asNumber(row.expires_at),
    consumedAt: asNullableNumber(row.consumed_at),
    credentialId: row.credential_id == null ? null : asString(row.credential_id),
  }
}

function mapOwnerAgentCredential(row: SqlRow): OwnerAgentCredentialRecord {
  return {
    id: asString(row.id),
    tokenHash: asString(row.token_hash),
    permissions: asPermissions(row.permissions_json),
    createdAt: asNumber(row.created_at),
    revokedAt: asNullableNumber(row.revoked_at),
    lastUsedAt: asNullableNumber(row.last_used_at),
  }
}

function changedRows(result: { changes: bigint | number }): number {
  return typeof result.changes === 'bigint' ? Number(result.changes) : result.changes
}

function withTransaction<T>(db: DatabaseSyncType, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function createStore(databasePath: string): SharedSpaceStore {
  const db = new DatabaseSync(databasePath)
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS shared_space_proposals (
      id TEXT PRIMARY KEY,
      owner_principal_id TEXT NOT NULL,
      root_path TEXT NOT NULL,
      preview_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      contract_version INTEGER,
      requested_duration_days INTEGER,
      requested_permissions_json TEXT
    );
    CREATE TABLE IF NOT EXISTS shared_spaces (
      id TEXT PRIMARY KEY,
      owner_principal_id TEXT NOT NULL,
      root_path TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS shared_space_invites (
      id TEXT PRIMARY KEY,
      shared_space_id TEXT NOT NULL REFERENCES shared_spaces(id),
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      redeemed_at INTEGER,
      redeemed_by_principal_id TEXT,
      idempotency_key_hash TEXT,
      access_token_hash TEXT,
      access_token_id TEXT
    );
    CREATE TABLE IF NOT EXISTS shared_space_access_tokens (
      id TEXT PRIMARY KEY,
      shared_space_id TEXT NOT NULL REFERENCES shared_spaces(id),
      token_hash TEXT NOT NULL UNIQUE,
      principal_id TEXT NOT NULL,
      permissions_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      last_used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS shared_space_read_links (
      id TEXT PRIMARY KEY,
      shared_space_id TEXT NOT NULL UNIQUE REFERENCES shared_spaces(id),
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS owner_agent_connections (
      id TEXT PRIMARY KEY,
      owner_principal_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      permissions_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      credential_id TEXT
    );
    CREATE TABLE IF NOT EXISTS owner_agent_credentials (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      permissions_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER,
      last_used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_shared_space_invites_hash ON shared_space_invites(token_hash);
    CREATE INDEX IF NOT EXISTS idx_shared_space_access_tokens_hash ON shared_space_access_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_shared_space_read_links_hash ON shared_space_read_links(token_hash);
    CREATE INDEX IF NOT EXISTS idx_owner_agent_connections_hash ON owner_agent_connections(token_hash);
    CREATE INDEX IF NOT EXISTS idx_owner_agent_credentials_hash ON owner_agent_credentials(token_hash);
    CREATE INDEX IF NOT EXISTS idx_shared_spaces_owner ON shared_spaces(owner_principal_id);
  `)

  // Existing deployments predate the v2 columns. Keep the migration local to
  // this store so reopening the same durable database is sufficient.
  const proposalColumns = db.prepare('PRAGMA table_info(shared_space_proposals)').all() as SqlRow[]
  const inviteColumns = db.prepare('PRAGMA table_info(shared_space_invites)').all() as SqlRow[]
  const hasColumn = (columns: SqlRow[], name: string) => columns.some((column) => asString(column.name) === name)
  if (!hasColumn(proposalColumns, 'contract_version')) db.exec('ALTER TABLE shared_space_proposals ADD COLUMN contract_version INTEGER')
  if (!hasColumn(proposalColumns, 'requested_duration_days')) db.exec('ALTER TABLE shared_space_proposals ADD COLUMN requested_duration_days INTEGER')
  if (!hasColumn(proposalColumns, 'requested_permissions_json')) db.exec('ALTER TABLE shared_space_proposals ADD COLUMN requested_permissions_json TEXT')
  if (!hasColumn(inviteColumns, 'idempotency_key_hash')) db.exec('ALTER TABLE shared_space_invites ADD COLUMN idempotency_key_hash TEXT')
  if (!hasColumn(inviteColumns, 'access_token_hash')) db.exec('ALTER TABLE shared_space_invites ADD COLUMN access_token_hash TEXT')
  if (!hasColumn(inviteColumns, 'access_token_id')) db.exec('ALTER TABLE shared_space_invites ADD COLUMN access_token_id TEXT')

  return {
    createProposal(proposal) {
      db.prepare(`
        INSERT INTO shared_space_proposals
          (id, owner_principal_id, root_path, preview_json, created_at, expires_at, consumed_at, contract_version, requested_duration_days, requested_permissions_json)
        VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
      `).run(
        proposal.id,
        proposal.ownerPrincipalId,
        proposal.rootPath,
        JSON.stringify(proposal.preview),
        proposal.createdAt,
        proposal.expiresAt,
        proposal.contractVersion ?? null,
        proposal.requestedDurationDays ?? null,
        proposal.requestedPermissions == null ? null : serializePermissions(proposal.requestedPermissions),
      )
    },

    getProposal(id) {
      const row = db.prepare('SELECT * FROM shared_space_proposals WHERE id = ?').get(id) as SqlRow | undefined
      return row ? mapProposal(row) : null
    },

    consumeProposalAndCreateSpace(input) {
      return withTransaction(db, () => {
        const proposalRow = db.prepare(
          'SELECT * FROM shared_space_proposals WHERE id = ? AND owner_principal_id = ?',
        ).get(input.proposalId, input.ownerPrincipalId) as SqlRow | undefined
        if (!proposalRow) {
          return null
        }

        const proposal = mapProposal(proposalRow)
        if (proposal.consumedAt != null || proposal.expiresAt <= input.now) {
          return null
        }

        const consumed = db.prepare(
          'UPDATE shared_space_proposals SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL',
        ).run(input.now, input.proposalId)
        if (changedRows(consumed) !== 1) {
          return null
        }

        db.prepare(`
          INSERT INTO shared_spaces
            (id, owner_principal_id, root_path, permissions_json, created_at, expires_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.space.id,
          input.space.ownerPrincipalId,
          input.space.rootPath,
          serializePermissions(input.space.permissions),
          input.space.createdAt,
          input.space.expiresAt,
          input.space.revokedAt,
        )
        db.prepare(`
          INSERT INTO shared_space_invites
            (id, shared_space_id, token_hash, created_at, expires_at, redeemed_at, redeemed_by_principal_id, idempotency_key_hash, access_token_hash, access_token_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.invite.id,
          input.invite.sharedSpaceId,
          input.invite.tokenHash,
          input.invite.createdAt,
          input.invite.expiresAt,
          input.invite.redeemedAt,
          input.invite.redeemedByPrincipalId,
          input.invite.idempotencyKeyHash ?? null,
          input.invite.accessTokenHash ?? null,
          input.invite.accessTokenId ?? null,
        )

        return { space: input.space, invite: input.invite }
      })
    },

    getSpace(id) {
      const row = db.prepare('SELECT * FROM shared_spaces WHERE id = ?').get(id) as SqlRow | undefined
      return row ? mapSpace(row) : null
    },

    listSpaces(ownerPrincipalId) {
      const rows = db.prepare(
        'SELECT * FROM shared_spaces WHERE owner_principal_id = ? ORDER BY created_at DESC, id ASC',
      ).all(ownerPrincipalId) as SqlRow[]
      return rows.map(mapSpace)
    },

    createInvite(invite) {
      db.prepare(`
        INSERT INTO shared_space_invites
          (id, shared_space_id, token_hash, created_at, expires_at, redeemed_at, redeemed_by_principal_id, idempotency_key_hash, access_token_hash, access_token_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invite.id,
        invite.sharedSpaceId,
        invite.tokenHash,
        invite.createdAt,
        invite.expiresAt,
        invite.redeemedAt,
        invite.redeemedByPrincipalId,
        invite.idempotencyKeyHash ?? null,
        invite.accessTokenHash ?? null,
        invite.accessTokenId ?? null,
      )
    },

    getInviteContext(tokenHash) {
      const row = db.prepare(`
        SELECT
          invites.*,
          spaces.owner_principal_id,
          spaces.root_path,
          spaces.permissions_json,
          spaces.created_at AS space_created_at,
          spaces.expires_at AS space_expires_at,
          spaces.revoked_at AS space_revoked_at
        FROM shared_space_invites AS invites
        JOIN shared_spaces AS spaces ON spaces.id = invites.shared_space_id
        WHERE invites.token_hash = ?
      `).get(tokenHash) as SqlRow | undefined
      if (!row) {
        return null
      }

      return {
        invite: mapInvite(row),
        space: mapSpace({
          id: row.shared_space_id,
          owner_principal_id: row.owner_principal_id,
          root_path: row.root_path,
          permissions_json: row.permissions_json,
          created_at: row.space_created_at,
          expires_at: row.space_expires_at,
          revoked_at: row.space_revoked_at,
        }),
      }
    },

    redeemInvite(input) {
      return withTransaction(db, () => {
        const row = db.prepare(`
          SELECT
            invites.*,
            spaces.owner_principal_id,
            spaces.root_path,
            spaces.permissions_json,
            spaces.created_at AS space_created_at,
            spaces.expires_at AS space_expires_at,
            spaces.revoked_at AS space_revoked_at
          FROM shared_space_invites AS invites
          JOIN shared_spaces AS spaces ON spaces.id = invites.shared_space_id
          WHERE invites.token_hash = ?
        `).get(input.tokenHash) as SqlRow | undefined
        if (!row) {
          return null
        }

        const invite = mapInvite(row)
        const space = mapSpace({
          id: row.shared_space_id,
          owner_principal_id: row.owner_principal_id,
          root_path: row.root_path,
          permissions_json: row.permissions_json,
          created_at: row.space_created_at,
          expires_at: row.space_expires_at,
          revoked_at: row.space_revoked_at,
        })
        if (space.expiresAt <= input.now || space.revokedAt != null) {
          return null
        }

        if (invite.redeemedAt != null) {
          if (
            !input.idempotencyKeyHash ||
            invite.idempotencyKeyHash !== input.idempotencyKeyHash ||
            invite.accessTokenHash !== input.accessToken.tokenHash
          ) {
            return null
          }

          return { space, invite }
        }

        if (invite.expiresAt <= input.now) {
          return null
        }

        const redeemed = db.prepare(`
          UPDATE shared_space_invites
          SET redeemed_at = ?, redeemed_by_principal_id = ?, idempotency_key_hash = ?, access_token_hash = ?, access_token_id = ?
          WHERE id = ? AND redeemed_at IS NULL AND expires_at > ?
        `).run(
          input.now,
          input.principalId,
          input.idempotencyKeyHash ?? null,
          input.accessToken.tokenHash,
          input.accessToken.id,
          invite.id,
          input.now,
        )
        if (changedRows(redeemed) !== 1) {
          return null
        }

        db.prepare(`
          INSERT INTO shared_space_access_tokens
            (id, shared_space_id, token_hash, principal_id, permissions_json, created_at, expires_at, revoked_at, last_used_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.accessToken.id,
          input.accessToken.sharedSpaceId,
          input.accessToken.tokenHash,
          input.accessToken.principalId,
          serializePermissions(input.accessToken.permissions),
          input.accessToken.createdAt,
          input.accessToken.expiresAt,
          input.accessToken.revokedAt,
          input.accessToken.lastUsedAt,
        )

        return {
          space,
          invite: {
            ...invite,
            redeemedAt: input.now,
            redeemedByPrincipalId: input.principalId,
            idempotencyKeyHash: input.idempotencyKeyHash ?? null,
            accessTokenHash: input.accessToken.tokenHash,
            accessTokenId: input.accessToken.id,
          },
        }
      })
    },

    findAccessToken(tokenHash, now) {
      const row = db.prepare(`
        SELECT
          tokens.*,
          spaces.root_path,
          spaces.expires_at AS space_expires_at,
          spaces.revoked_at AS space_revoked_at
        FROM shared_space_access_tokens AS tokens
        JOIN shared_spaces AS spaces ON spaces.id = tokens.shared_space_id
        WHERE tokens.token_hash = ?
      `).get(tokenHash) as SqlRow | undefined
      if (!row) {
        return null
      }

      const token = mapAccessToken(row)
      if (token.revokedAt != null || token.expiresAt <= now || token.sharedSpaceExpiresAt <= now || token.sharedSpaceRevokedAt != null) {
        return null
      }

      return token
    },

    touchAccessToken(id, now) {
      db.prepare('UPDATE shared_space_access_tokens SET last_used_at = ? WHERE id = ?').run(now, id)
    },

    revokeSpace(id, now) {
      const result = db.prepare('UPDATE shared_spaces SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').run(now, id)
      return changedRows(result) === 1
    },

    extendSpace(id, expiresAt) {
      return withTransaction(db, () => {
        const result = db.prepare('UPDATE shared_spaces SET expires_at = ? WHERE id = ? AND revoked_at IS NULL').run(expiresAt, id)
        if (changedRows(result) !== 1) {
          return null
        }

        db.prepare(`
          UPDATE shared_space_access_tokens
          SET expires_at = ?
          WHERE shared_space_id = ? AND revoked_at IS NULL AND expires_at < ?
        `).run(expiresAt, id, expiresAt)

        const row = db.prepare('SELECT * FROM shared_spaces WHERE id = ?').get(id) as SqlRow | undefined
        return row ? mapSpace(row) : null
      })
    },

    getAccessTokenForTest(tokenHash) {
      const row = db.prepare(`
        SELECT
          tokens.*,
          spaces.root_path,
          spaces.expires_at AS space_expires_at,
          spaces.revoked_at AS space_revoked_at
        FROM shared_space_access_tokens AS tokens
        JOIN shared_spaces AS spaces ON spaces.id = tokens.shared_space_id
        WHERE tokens.token_hash = ?
      `).get(tokenHash) as SqlRow | undefined
      return row ? mapAccessToken(row) : null
    },

    rotateReadLink(input) {
      return withTransaction(db, () => {
        db.prepare(`
          INSERT INTO shared_space_read_links
            (id, shared_space_id, token_hash, created_at, expires_at, revoked_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(shared_space_id) DO UPDATE SET
            id = excluded.id,
            token_hash = excluded.token_hash,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at,
            revoked_at = excluded.revoked_at
        `).run(
          input.id,
          input.sharedSpaceId,
          input.tokenHash,
          input.createdAt,
          input.expiresAt,
          input.revokedAt,
        )

        const row = db.prepare(`
          SELECT
            links.*,
            spaces.root_path,
            spaces.expires_at AS space_expires_at,
            spaces.revoked_at AS space_revoked_at
          FROM shared_space_read_links AS links
          JOIN shared_spaces AS spaces ON spaces.id = links.shared_space_id
          WHERE links.shared_space_id = ?
        `).get(input.sharedSpaceId) as SqlRow | undefined
        if (!row) {
          throw new Error('Read-link rotation did not persist')
        }
        return mapReadLink(row)
      })
    },

    findReadLink(tokenHash, now) {
      const row = db.prepare(`
        SELECT
          links.*,
          spaces.root_path,
          spaces.expires_at AS space_expires_at,
          spaces.revoked_at AS space_revoked_at
        FROM shared_space_read_links AS links
        JOIN shared_spaces AS spaces ON spaces.id = links.shared_space_id
        WHERE links.token_hash = ?
      `).get(tokenHash) as SqlRow | undefined
      if (!row) {
        return null
      }

      const link = mapReadLink(row)
      if (link.revokedAt != null || link.expiresAt <= now || link.sharedSpaceExpiresAt <= now || link.sharedSpaceRevokedAt != null) {
        return null
      }
      return link
    },

    revokeReadLink(sharedSpaceId, now) {
      const result = db.prepare(
        'UPDATE shared_space_read_links SET revoked_at = COALESCE(revoked_at, ?) WHERE shared_space_id = ?',
      ).run(now, sharedSpaceId)
      return changedRows(result) === 1
    },

    getReadLinkForTest(sharedSpaceId) {
      const row = db.prepare(`
        SELECT
          links.*,
          spaces.root_path,
          spaces.expires_at AS space_expires_at,
          spaces.revoked_at AS space_revoked_at
        FROM shared_space_read_links AS links
        JOIN shared_spaces AS spaces ON spaces.id = links.shared_space_id
        WHERE links.shared_space_id = ?
      `).get(sharedSpaceId) as SqlRow | undefined
      return row ? mapReadLink(row) : null
    },

    createOwnerAgentConnection(connection) {
      db.prepare(`
        INSERT INTO owner_agent_connections
          (id, owner_principal_id, token_hash, permissions_json, created_at, expires_at, consumed_at, credential_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        connection.id,
        connection.ownerPrincipalId,
        connection.tokenHash,
        serializePermissions(connection.permissions),
        connection.createdAt,
        connection.expiresAt,
        connection.consumedAt,
        connection.credentialId,
      )
    },

    redeemOwnerAgentConnection(input) {
      return withTransaction(db, () => {
        const row = db.prepare(
          'SELECT * FROM owner_agent_connections WHERE token_hash = ?',
        ).get(input.tokenHash) as SqlRow | undefined
        if (!row) {
          return null
        }

        const connection = mapOwnerAgentConnection(row)
        if (connection.consumedAt != null || connection.expiresAt <= input.now) {
          return null
        }

        const consumed = db.prepare(`
          UPDATE owner_agent_connections
          SET consumed_at = ?, credential_id = ?
          WHERE id = ? AND consumed_at IS NULL AND expires_at > ?
        `).run(input.now, input.credential.id, connection.id, input.now)
        if (changedRows(consumed) !== 1) {
          return null
        }

        const credential: OwnerAgentCredentialRecord = {
          ...input.credential,
          permissions: connection.permissions,
        }
        db.prepare(`
          INSERT INTO owner_agent_credentials
            (id, token_hash, permissions_json, created_at, revoked_at, last_used_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          credential.id,
          credential.tokenHash,
          serializePermissions(credential.permissions),
          credential.createdAt,
          credential.revokedAt,
          credential.lastUsedAt,
        )

        return {
          connection: {
            ...connection,
            consumedAt: input.now,
            credentialId: credential.id,
          },
          credential,
        }
      })
    },

    findOwnerAgentCredential(tokenHash) {
      const row = db.prepare(
        'SELECT * FROM owner_agent_credentials WHERE token_hash = ?',
      ).get(tokenHash) as SqlRow | undefined
      if (!row) {
        return null
      }

      const credential = mapOwnerAgentCredential(row)
      return credential.revokedAt == null ? credential : null
    },

    touchOwnerAgentCredential(id, now) {
      db.prepare('UPDATE owner_agent_credentials SET last_used_at = ? WHERE id = ?').run(now, id)
    },

    getOwnerAgentConnectionForTest(tokenHash) {
      const row = db.prepare(
        'SELECT * FROM owner_agent_connections WHERE token_hash = ?',
      ).get(tokenHash) as SqlRow | undefined
      return row ? mapOwnerAgentConnection(row) : null
    },

    getOwnerAgentCredentialForTest(tokenHash) {
      const row = db.prepare(
        'SELECT * FROM owner_agent_credentials WHERE token_hash = ?',
      ).get(tokenHash) as SqlRow | undefined
      return row ? mapOwnerAgentCredential(row) : null
    },

    close() {
      db.close()
    },
  }
}

let activeStore: SharedSpaceStore | null = null
let activeDatabasePath: string | null = null

export function resolveSharedSpaceDataPath(): string {
  const configuredPath = process.env.NABU_DATA_PATH?.trim()

  if (!configuredPath) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NABU_DATA_PATH is required in production')
    }

    return path.resolve(process.cwd(), '.nabu-data')
  }

  if (!path.isAbsolute(configuredPath)) {
    throw new Error('NABU_DATA_PATH must be an absolute path')
  }

  return configuredPath
}

export async function getSharedSpaceStore(): Promise<SharedSpaceStore> {
  const dataPath = resolveSharedSpaceDataPath()
  const databasePath = path.join(dataPath, SHARED_SPACE_DATABASE_FILENAME)

  if (activeStore && activeDatabasePath === databasePath) {
    return activeStore
  }

  activeStore?.close()
  await mkdir(dataPath, { recursive: true })
  activeStore = createStore(databasePath)
  activeDatabasePath = databasePath
  return activeStore
}

export function __resetSharedSpaceStoreForTests(): void {
  activeStore?.close()
  activeStore = null
  activeDatabasePath = null
}
