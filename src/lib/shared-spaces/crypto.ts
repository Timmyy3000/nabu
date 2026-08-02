import { createHash, randomBytes, randomUUID } from 'node:crypto'

export function generateOpaqueSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}
