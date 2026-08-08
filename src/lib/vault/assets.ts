import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  isPublicReadLinkPrincipal,
  OWNER_VAULT_PRINCIPAL,
  assertVaultPathAccess,
  vaultPrincipalHeaders,
  VaultAuthorizationError,
  type VaultPrincipal,
} from '../auth/authorization'
import { normalizeVaultPath } from '../paths'
import { getVaultConfig } from './config'

const PUBLIC_SHARED_SPACE_UNAVAILABLE = 'Shared space unavailable'

function getPrincipal(principal: VaultPrincipal | undefined): VaultPrincipal {
  return principal ?? OWNER_VAULT_PRINCIPAL
}

function responseHeaders(principal: VaultPrincipal, contentType?: string): Headers {
  const headers = vaultPrincipalHeaders(principal)
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  headers.set('X-Content-Type-Options', 'nosniff')

  if (isPublicReadLinkPrincipal(principal)) {
    headers.set('Cache-Control', 'private, no-store')
    headers.set('Referrer-Policy', 'no-referrer')
  }

  return headers
}

function unavailable(principal: VaultPrincipal, status = 404): Response {
  return Response.json(
    { error: isPublicReadLinkPrincipal(principal) ? PUBLIC_SHARED_SPACE_UNAVAILABLE : 'The requested vault resource is not available.' },
    { status, headers: responseHeaders(principal) },
  )
}

function mimeType(relPath: string): string {
  const extension = path.posix.extname(relPath).toLowerCase()
  const types: Record<string, string> = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
  }
  return types[extension] ?? 'application/octet-stream'
}

async function assertNoSymlinkSegments(rootPath: string, relPath: string): Promise<void> {
  let currentPath = rootPath
  for (const segment of relPath.split('/')) {
    currentPath = path.join(currentPath, segment)
    const entry = await lstat(currentPath)
    if (entry.isSymbolicLink()) {
      throw new VaultAuthorizationError('The requested vault resource is not available.')
    }
  }
}

function isInsideRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath)
  return relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

export async function getVaultAssetResponse(
  pathInput: string | null | undefined,
  principalInput?: VaultPrincipal,
): Promise<Response> {
  const principal = getPrincipal(principalInput)
  if (typeof pathInput === 'string' && pathInput.includes('\0')) {
    if (isPublicReadLinkPrincipal(principal)) {
      return unavailable(principal)
    }

    return Response.json(
      { error: 'Invalid asset path', path: pathInput },
      { status: 400, headers: responseHeaders(principal) },
    )
  }

  let relPath: string

  try {
    relPath = normalizeVaultPath(pathInput ?? '')
    assertVaultPathAccess(principal, relPath)
  } catch (error) {
    if (error instanceof VaultAuthorizationError || isPublicReadLinkPrincipal(principal)) {
      return unavailable(principal)
    }

    return Response.json(
      { error: 'Invalid asset path', path: pathInput ?? '' },
      { status: 400, headers: responseHeaders(principal) },
    )
  }

  let fileHandle: Awaited<ReturnType<typeof open>> | null = null

  try {
    const { rootPath } = await getVaultConfig()
    const resolvedRoot = await realpath(rootPath)
    const absolutePath = path.resolve(resolvedRoot, relPath)

    if (!isInsideRoot(resolvedRoot, absolutePath)) {
      return unavailable(principal)
    }

    await assertNoSymlinkSegments(resolvedRoot, relPath)
    const entry = await lstat(absolutePath)
    if (!entry.isFile()) {
      return unavailable(principal)
    }

    const resolvedTarget = await realpath(absolutePath)
    if (!isInsideRoot(resolvedRoot, resolvedTarget)) {
      return unavailable(principal)
    }

    const readFlags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    fileHandle = await open(resolvedTarget, readFlags)
    const openedEntry = await fileHandle.stat()
    if (!openedEntry.isFile()) {
      return unavailable(principal)
    }

    const revalidatedTarget = await realpath(resolvedTarget)
    if (!isInsideRoot(resolvedRoot, revalidatedTarget)) {
      return unavailable(principal)
    }

    const content = await fileHandle.readFile()
    return new Response(content, {
      status: 200,
      headers: responseHeaders(principal, mimeType(relPath)),
    })
  } catch (error) {
    if (
      isPublicReadLinkPrincipal(principal)
      || error instanceof VaultAuthorizationError
      || ['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')
    ) {
      return unavailable(principal)
    }

    throw error
  } finally {
    await fileHandle?.close().catch(() => undefined)
  }
}
