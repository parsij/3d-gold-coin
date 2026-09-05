import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const cloudflareHost = 'atmospheric-macro-popular-numbers.trycloudflare.com'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: [cloudflareHost],
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: [cloudflareHost],
  },
})
