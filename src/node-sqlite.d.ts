declare module 'node:sqlite' {
  export type StatementChanges = {
    changes: bigint | number
  }

  export class StatementSync {
    run(...parameters: unknown[]): StatementChanges
    get(...parameters: unknown[]): unknown
    all(...parameters: unknown[]): unknown[]
  }

  export class DatabaseSync {
    constructor(location: string)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
