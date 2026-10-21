import type { KunaApi } from '../shared/ipc'

declare global {
  interface Window {
    kuna: KunaApi
  }
}

export {}
