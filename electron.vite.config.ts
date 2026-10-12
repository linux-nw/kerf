import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const alias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias }
  },
  preload: {
    resolve: { alias }
  },
  renderer: {
    resolve: { alias },
    plugins: [
      react(),
      {
        name: 'kerf-csp',
        apply: 'build',
        transformIndexHtml(html) {
          return html.replace(
            '<!--kerf-csp-->',
            `<meta http-equiv="Content-Security-Policy" content="${productionCsp}" />`
          )
        }
      }
    ],
    server: { fs: { allow: [resolve('.')] } }
  }
})
