import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(resolve(process.cwd(), 'src/routes/index.tsx'), 'utf8')

describe('read-link page server functions', () => {
  it('uses POST for every token-bearing server function', () => {
    const methods = routeSource
      .split(/\r?\n/)
      .filter((line) => line.includes('= createServerFn'))
      .map((line) => line.match(/method: '(GET|POST)'/)?.[1])

    expect(methods).toHaveLength(3)
    expect(methods).toEqual(['POST', 'POST', 'POST'])
  })
})
