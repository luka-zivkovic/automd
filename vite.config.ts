import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@automd/shared': path.resolve(__dirname, './packages/shared/src/index.ts'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.AUTOMD_PORT || 4800}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${process.env.AUTOMD_PORT || 4800}`,
        ws: true,
      },
    },
  },
})
