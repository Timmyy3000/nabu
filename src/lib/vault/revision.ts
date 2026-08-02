export function parseIfMatchHeader(value: string | null): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const match = /^(?:W\/)?"([^"]+)"$/.exec(trimmed)
  return match?.[1] ?? null
}
