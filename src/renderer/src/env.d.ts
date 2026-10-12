import type { KerfApi } from '@shared/types'

declare global {
  interface Window {
    kerf: KerfApi
  }
}

export {}
