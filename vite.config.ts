import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // El worker de entrenamiento importa módulos de engine/; formato ES para
  // que el build de producción no caiga al fallback IIFE.
  worker: { format: 'es' },
})
