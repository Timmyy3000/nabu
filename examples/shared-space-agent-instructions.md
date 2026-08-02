# Temporary shared-space agent instructions

When a human asks to share a vault folder:

1. Call `propose_shared_space` with the vault-relative folder and requested duration.
2. Show the complete returned file and folder tree, counts, total size, warnings,
   and the statement that descendants added later are included automatically.
3. Ask for explicit confirmation. A proposal alone never shares anything.
4. Call `confirm_shared_space` only after the human confirms, using a duration
   between 1 and 30 days and explicit read/write permissions.
5. Give the one-time invite URL to the collaborator. Never persist its secret.

After redemption, use the returned access token as a bearer credential. It can
reach only the shared root and descendants. Before updating or moving a note,
read it and preserve its `revision` or `ETag`:

```text
read -> edit/merge -> PUT/PATCH with If-Match or expectedRevision ->
if 409, re-read and merge again
```

Existing owner agents may temporarily perform legacy writes, but migrate to
revision-aware writes whenever the API returns
`WRITE_REVISION_MIGRATION_REQUIRED`.

Shared spaces are temporary, live recursive knowledge boundaries. All files
created under the shared root remain accessible to participants until the
space expires or is revoked.
