import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'

const pkg = createRequire(import.meta.url)('./package.json') as { version: string }

function startupBanner(): Plugin {
  const branch = process.env.GIT_BRANCH || 'unknown'
  const sha = (process.env.GIT_SHA || 'unknown').slice(0, 7)
  const channel = branch === 'main' || branch.startsWith('v') ? 'release' : 'dev'
  const banner =
    `AmmoLedger frontend starting | version=v${pkg.version} | ` +
    `channel=${channel} | branch=${branch} | sha=${sha} | node=${process.version}`
  let logged = false
  const log = () => {
    if (logged) return
    logged = true
    // eslint-disable-next-line no-console
    console.log(`✓ ${banner}`)
  }
  return {
    name: 'ammoledger-startup-banner',
    configureServer: log,
    buildStart: log,
  }
}

export default defineConfig({
  plugins: [startupBanner(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    watch: {
      usePolling: true,   // needed for inotify-less filesystems (Windows Docker)
      interval: 1000,
    },
    proxy: {
      '/api': {
        target: process.env.AL_BACKEND_URL || 'http://backend:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
