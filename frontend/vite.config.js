import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Split the libraries that never change out of the app code. The
        // browser then caches them separately and does not have to re-download
        // them whenever a page changes, and no single chunk stays large enough
        // to be the slowest part of a cold load.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          axios: ['axios'],
          date: ['date-fns'],
          icons: ['lucide-react'],
        }
      }
    }
  }
})
