import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(resolve(process.cwd(), 'src/routes/index.tsx'), 'utf8')
const homeSource = readFileSync(resolve(process.cwd(), 'src/pages/home.tsx'), 'utf8')

describe('read-link page server functions', () => {
  it('uses POST for every token-bearing server function', () => {
    const methods = routeSource
      .split(/\r?\n/)
      .filter((line) => line.includes('= createServerFn'))
      .map((line) => line.match(/method: '(GET|POST)'/)?.[1])

    expect(methods).toHaveLength(3)
    expect(methods).toEqual(['POST', 'POST', 'POST'])
  })

  it('uses the public page endpoint for browser transitions without document reloads', () => {
    expect(routeSource).toContain('fetchPublicPageData')
    expect(routeSource).toContain("typeof window !== 'undefined'")
    expect(homeSource).not.toContain('reloadDocument')
  })
})
