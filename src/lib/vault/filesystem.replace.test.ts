import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'
import { replaceVaultFile } from './filesystem'

describe('vault file replacement failures', () => {
  it('preserves the original file when the Windows-style replacement fallback fails', async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), 'nabu-vault-replace-'))
    const notePath = path.join(rootPath, 'note.md')
    const renameMock = vi.fn().mockRejectedValue(Object.assign(new Error('sharing violation'), { code: 'EPERM' }))
    const copyFileMock = vi.fn().mockRejectedValue(new Error('replacement failed'))

    try {
      await writeFile(notePath, '# Original')

      await expect(
        replaceVaultFile(notePath, '# Replacement', {
          copyFile: copyFileMock,
          rename: renameMock,
          rm,
          writeFile,
        }),
      ).rejects.toThrow('replacement failed')
      await expect(readFile(notePath, 'utf8')).resolves.toBe('# Original')
      expect(copyFileMock).toHaveBeenCalledTimes(1)
    } finally {
      await rm(rootPath, { recursive: true, force: true })
    }
  })
})
