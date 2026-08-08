# Nabu authentication and shared-space security

Nabu uses one password for human sessions and remote MCP. A password login
creates the signed `nabu_session` cookie, while remote MCP derives the owner
bearer credential from that same `NABU_PASSWORD`. There is no separate agent
token configuration; clients using the removed configuration must be
reconfigured with the Nabu password.

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
