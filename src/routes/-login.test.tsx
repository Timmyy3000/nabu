// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoginPage } from './login'

describe('LoginPage', () => {
  it('tells agents to use /agents.md instead of the browser UI workflow', () => {
    render(<LoginPage redirect="/" error="" />)

    expect(screen.getByText('/agents.md')).toBeInTheDocument()
    expect(screen.getByText(/use the api contract, not the browser ui/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /agent contract/i })).toHaveAttribute('href', '/agents.md')
  })
})
