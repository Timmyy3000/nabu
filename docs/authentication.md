# Nabu authentication and shared-space security

Nabu uses one password for human sessions and supports two bearer paths for
remote MCP. A password login creates the signed `nabu_session` cookie, while
the legacy remote MCP setup derives the owner bearer credential from that same
`NABU_PASSWORD`. Owners can also generate a durable owner-scoped agent
credential through the one-time connection-link flow below.

## Owner agent connection links

An authenticated owner can create an agent connection link from **Settings →
Agents**. The issuance endpoint is:

```http
POST /api/agent/connections
Content-Type: application/json
Cookie: nabu_session=<human-session>

{ "permissions": ["read"] }
```

The permissions are either `["read"]` or `["read", "write"]`; both grant
whole-vault owner scope. The response contains a complete connection URL and
an expiry timestamp. The URL is a short-lived, opaque capability: it expires
after 10 minutes, can be redeemed once, and never contains the durable
credential.

The receiving agent redeems it exactly once:

```http
POST /api/agent/connections/redeem
Content-Type: application/json

{ "connectionUrl": "https://nabu.example.com/connect/agent/<opaque-secret>" }
```

Successful redemption returns the durable bearer credential once, together with
an `expiresAt` timestamp 90 days after issuance. Store it in the agent's secret
configuration and send it on subsequent requests as:

```http
Authorization: Bearer <owner-agent-credential>
```

The credential is stored server-side only as a SHA-256 hash, is scoped to the
permissions selected at issuance, and is rejected after its expiry. An invalid,
expired, or already-used link returns `410 AGENT_CONNECTION_INVALID`; an expired
durable credential returns `401`. The current flow does not expose credential
listing or manual revocation, so protect generated links and credentials as
secrets and issue a new link when a credential expires or the redemption
response is lost.

Remote MCP accepts `NABU_AGENT_TOKEN` for this credential and retains
`NABU_PASSWORD` as the backwards-compatible setup path. The owner-agent
principal can read the full vault and can write only when the issued
permission includes `write`; it cannot manage shared spaces as the human
owner.

## Native remote MCP

The native MCP endpoint is `POST /mcp` over stateless Streamable HTTP. It uses
the same password-derived owner bearer as remote stdio and does not accept the
browser session cookie or URL query tokens:

```http
Authorization: Bearer <owner-credential-or-scoped-access-token>
```

The credential is durable across agents, sessions, and chats. A request without
an `Authorization` header receives a bootstrap surface containing only
`redeem_shared_space_invite`; it cannot list resources or read the vault. An
invalid bearer returns `401` with a Bearer challenge and never falls back to
bootstrap.

Redeem an invite through that bootstrap tool, persist the returned access token
in an approved secret profile, and reuse it. The token carries the shared root,
read/read-write permission, and lease expiry. Each MCP request re-checks expiry
and revocation. Owner-only MCP tools manage proposals, invites, leases, and
revocation; shared collaborators receive only the scoped vault surface.

MCP redemption accepts an optional `Idempotency-Key`. When it is omitted, Nabu
derives a stable non-secret key from the invite input, keeping retries safe
without requiring agents to invent another credential. Raw invite URLs, access
tokens, and bearer credentials must never be logged or stored in ordinary
workspace files.

In production, configure `NABU_PUBLIC_URL` and expose the endpoint through
HTTPS. Nabu validates the canonical `Host` and any present browser `Origin`
before dispatch. Non-production request-derived origins are allowed only for
loopback hosts. OAuth discovery is intentionally outside the v1 flow.

## Shared-space credentials

Shared-space invites are one-time capabilities. They are valid for one hour,
contain an opaque random secret, and are invalid after redemption, lease
expiry, or revocation. Nabu persists only a SHA-256 hash of the invite secret.

Redemption returns a new random access token. The token is scoped to exactly
one shared-space root and its read/write permissions, and expires no later than
the lease. Nabu persists only its hash. Do not put access tokens in Markdown,
logs, URLs, error messages, or audit records. Send a redeemed token only as:

```http
Authorization: Bearer <scoped-access-token>
```

Owners can issue a separate read-only browser/API capability with
`POST /api/shared-spaces/:sharedSpaceId/read-link`. It is returned only inside
the complete URL `/?path=<root>&token=<opaque-secret>`, is valid for 1–183 days
but never beyond the parent lease, and is stored only as a SHA-256 hash. Each
space has one active read link: issuing another rotates the previous one, while
`DELETE /api/shared-spaces/:sharedSpaceId/read-link` revokes the current link
without revoking the shared space. Treat the URL as a secret; do not put it in
logs, Markdown, or ordinary workspace files.

Read-link principals have read permission only. They can traverse the linked
root and descendants through the UI and read APIs, but parent, sibling,
prefix-collision, traversal, symlink, and outside-scope paths and assets are
denied with generic unavailable responses. Token-bearing HTML, API, and asset
responses use private no-store caching and no-referrer policy.

Shared tokens are checked against server time on every request. A valid token
can reach only `rootPath` or descendants using segment-aware matching; a path
such as `little-helpers-private` is not a descendant of `little-helpers`.

## Scope and information boundaries

Authorization runs before every vault read or mutation. Shared projections
filter private notes before constructing trees, indexes, search results,
backlinks, neighborhoods, related notes, and graph data. Private parent and
sibling paths are denied without returning their contents or metadata.

The shared root cannot be the vault root, traversal paths, absolute paths,
symlinks, or a path outside `KNOWLEDGE_PATH`. v1 has no exclusion rules: choose
a narrower root if a subtree should remain private.

## Concurrent writes

Note reads return a raw-Markdown SHA-256 `revision` and matching ETag. Agents
should send the value in `If-Match` or `expectedRevision` when updating or
moving a note. Shared-token writes require this precondition. A missing value
returns `428 WRITE_REVISION_REQUIRED`; a stale value returns `409
STALE_NOTE_REVISION` with a read URL and next action. Re-read, merge, and retry.

During the migration period, legacy owner writes without a revision remain
accepted and return `WRITE_REVISION_MIGRATION_REQUIRED`. Set
`NABU_REQUIRE_WRITE_REVISION=true` when all owner agents have migrated.
