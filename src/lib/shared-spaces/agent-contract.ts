/**
 * Non-secret literals shared by the deployment agent contract and its tests.
 * Capability values are represented only by placeholders.
 */
export const SHARED_SPACE_AGENT_CONTRACT = {
  version: 2,
  redemption: {
    method: 'POST',
    bodyField: 'inviteUrl',
    idempotencyHeader: 'Idempotency-Key',
    endpoint: '/api/shared-spaces/invites/redeem',
    responseLinks: {
      tree: '/api/vault/tree',
      rootFolder: '/api/vault/folders?path={rootPath}',
      noteByPath: '/api/vault/notes/by-path?path={path}',
      search: '/api/vault/search?path={rootPath}&q={query}',
    },
  },
  profile: {
    keys: [
      'NABU_PROFILE_VERSION',
      'NABU_API_BASE_URL',
      'NABU_SHARED_SPACE_ID',
      'NABU_ROOT_PATH',
      'NABU_PERMISSIONS',
      'NABU_ACCESS_TOKEN_EXPIRES_AT',
      'NABU_ACCESS_TOKEN',
    ],
    deploymentIdPlaceholder: '<deployment-id>',
    sharedSpaceIdPlaceholder: '<shared-space-id>',
    codexPath: '~/.codex/secrets/nabu/<deployment-id>/<shared-space-id>.env',
    hermesPath: '~/.hermes/secrets/nabu/<deployment-id>/<shared-space-id>.env',
    legacyHermesPath: '~/.hermes/secrets/nabu.env',
    example: [
      'NABU_PROFILE_VERSION=2',
      'NABU_API_BASE_URL=https://nabu.example.test/base',
      'NABU_SHARED_SPACE_ID=space_EXAMPLE',
      'NABU_ROOT_PATH=projects/example/shared',
      'NABU_PERMISSIONS=read,write',
      'NABU_ACCESS_TOKEN_EXPIRES_AT=2030-01-01T00:00:00.000Z',
      'NABU_ACCESS_TOKEN=<scoped-token-from-redemption>',
    ],
  },
} as const
