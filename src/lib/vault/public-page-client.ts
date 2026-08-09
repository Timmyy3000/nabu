import type { VaultBrowseData, VaultSearchResponse } from './service'

export type PublicPageInput = {
  token: string
  folder: string
  note: string
  q: string
  searchPath: string
  searchTag: string
}

export type PublicPageData = {
  browse: VaultBrowseData
  search: VaultSearchResponse | null
}

export async function fetchPublicPageData(
  input: PublicPageInput,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicPageData | null> {
  const response = await fetchImpl('/api/vault/page', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input),
  })

  if (response.status === 401 || response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error('Unable to load shared space')
  }

  return response.json() as Promise<PublicPageData>
}
