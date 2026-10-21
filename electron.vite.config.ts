import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/** The dev server's websocket (hot reload) is allowed in development only. */
function productionCsp(): Plugin {
  return {
    name: 'kuna-production-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace(' ws://localhost:*', '')
  }
}

const shared = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: {
      rollupOptions: { external: ['node-pty'] }
    }
  },
  preload: {
    resolve: { alias: shared }
  },
  renderer: {
    resolve: {
      alias: { ...shared, '@renderer': resolve(__dirname, 'src/renderer/src') }
    },
    plugins: [react(), productionCsp()]
  }
})
