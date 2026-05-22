import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
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
