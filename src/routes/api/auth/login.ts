import { createFileRoute } from '@tanstack/react-router'

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

export const Route = createFileRoute('/api/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { buildFailedLoginResponse, buildLoginResponse, verifyPassword } = await import(
          '../../../lib/auth/session'
        )
        const formData = await request.formData()
        const password = getStringField(formData, 'password')
        const redirectTo = getStringField(formData, 'redirect')

        if (!verifyPassword(password)) {
          return buildFailedLoginResponse(redirectTo)
        }

        return buildLoginResponse(request, redirectTo)
      },
    },
  },
})
