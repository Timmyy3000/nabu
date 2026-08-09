import { describe, expect, it, vi } from 'vitest'
import { fetchPublicPageData } from './public-page-client'

const input = {
  token: 'secret-token',
  folder: 'shared/docs',
  note: 'guide',
  q: '',
  searchPath: '',
  searchTag: '',
}

describe('fetchPublicPageData', () => {
  it('posts the read token in JSON without putting it in the URL', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ browse: { folder: {} }, search: null }))
    await fetchPublicPageData(input, fetchImpl)

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/vault/page')
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    expect(new URLSearchParams(String(url).split('?')[1] ?? '').has('token')).toBe(false)
    expect(JSON.parse(String(init?.body))).toEqual(input)
  })

  it('returns null for unavailable public spaces and throws for other failures', async () => {
    await expect(fetchPublicPageData(input, async () => new Response(null, { status: 401 }))).resolves.toBeNull()
    await expect(fetchPublicPageData(input, async () => new Response(null, { status: 404 }))).resolves.toBeNull()
    await expect(fetchPublicPageData(input, async () => new Response(null, { status: 500 }))).rejects.toThrow('Unable to load shared space')
  })
})
