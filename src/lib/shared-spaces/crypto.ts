import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'

export function generateOpaqueSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

export function deriveIdempotentAccessToken(inviteSecret: string, idempotencyKey: string): string {
  return createHmac('sha256', inviteSecret)
    .update('nabu/shared-space/access-token/v2\0', 'utf8')
    .update(idempotencyKey, 'utf8')
    .digest('base64url')
}

export function isValidIdempotencyKey(value: string): boolean {
  return value.length >= 22 && value.length <= 256 && /^[A-Za-z0-9._~-]+$/.test(value)
}
