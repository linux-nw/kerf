import type { JobErrorCode } from '@shared/types'

export class EngineError extends Error {
  readonly code: JobErrorCode

  constructor(code: JobErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'EngineError'
  }
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'CancelledError'
  }
}
