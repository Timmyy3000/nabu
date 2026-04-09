import { stat } from 'node:fs/promises'
import path from 'node:path'
import { VaultConfigError } from './errors'

export type VaultConfig = {
  rootPath: string
}

export async function getVaultConfig(): Promise<VaultConfig> {
  const configuredPath = process.env.KNOWLEDGE_PATH?.trim()

  if (!configuredPath) {
    throw new VaultConfigError('KNOWLEDGE_PATH is required.')
  }

  const rootPath = path.resolve(process.cwd(), configuredPath)
  const rootStat = await stat(rootPath).catch(() => {
    throw new VaultConfigError(`KNOWLEDGE_PATH does not exist: ${rootPath}`)
  })

  if (!rootStat.isDirectory()) {
    throw new VaultConfigError('KNOWLEDGE_PATH must point to a directory.')
  }

  return {
    rootPath,
  }
}
