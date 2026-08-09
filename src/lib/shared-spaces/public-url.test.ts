import { afterEach, describe, expect, it } from 'vitest'
import { resolveCanonicalPublicUrl } from './public-url'

const originalNodeEnv = process.env.NODE_ENV
const originalPublicUrl = process.env.NABU_PUBLIC_URL

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  if (originalPublicUrl === undefined) delete process.env.NABU_PUBLIC_URL
  else process.env.NABU_PUBLIC_URL = originalPublicUrl
})

describe('canonical public URL', () => {
  it('requires a configured HTTPS URL in production and ignores the request origin', () => {
    process.env.NODE_ENV = 'production'
    process.env.NABU_PUBLIC_URL = 'https://nabu.example/base/'

    expect(resolveCanonicalPublicUrl({ requestUrl: 'https://evil.example/api/health' })).toBe('https://nabu.example/base')
  })

  it('rejects an invalid production URL', () => {
    process.env.NODE_ENV = 'production'
    process.env.NABU_PUBLIC_URL = 'http://nabu.example'

    expect(() => resolveCanonicalPublicUrl()).toThrow('NABU_PUBLIC_URL')
  })

  it('allows a loopback request origin only outside production', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.NABU_PUBLIC_URL

    expect(resolveCanonicalPublicUrl({ requestUrl: 'http://127.0.0.1:4312/base/api/health' })).toBe('http://127.0.0.1:4312')
    expect(() => resolveCanonicalPublicUrl({ requestUrl: 'https://evil.example/api/health' })).toThrow('NABU_PUBLIC_URL')
  })
})
