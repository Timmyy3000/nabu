import { createHmac } from 'node:crypto'

const AGENT_CREDENTIAL_CONTEXT = 'nabu-agent-credential-v1'

export function deriveAgentCredential(password: string): string {
  const normalizedPassword = password.trim()

  if (!normalizedPassword) {
    throw new Error('NABU_PASSWORD is required')
  }

  return createHmac('sha256', normalizedPassword).update(AGENT_CREDENTIAL_CONTEXT).digest('base64url')
}
