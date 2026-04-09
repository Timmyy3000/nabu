export function normalizeVaultPath(input: string): string {
  const trimmed = input.trim().replace(/\\/g, '/')

  if (!trimmed) {
    throw new Error('Path cannot be empty.')
  }

  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Path traversal segments are not allowed.')
  }

  return segments.join('/')
}
