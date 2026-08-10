import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/empresas': 'http://localhost:3000',
      '/busca': 'http://localhost:3000',
      '/envios': 'http://localhost:3000',
      '/crawler': 'http://localhost:3000',
      '/dashboard': 'http://localhost:3000',
    },
  },
})
