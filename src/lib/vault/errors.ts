export class VaultConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultConfigError'
  }
}
