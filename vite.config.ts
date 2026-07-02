import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // El worker de entrenamiento importa módulos de engine/; formato ES para
  // que el build de producción no caiga al fallback IIFE.
  worker: { format: 'es' },
  // TF.js se carga por import dinámico al entrenar la LSTM: sin pre-bundle,
  // el dev server lo optimiza a mitad de sesión y RECARGA la página, matando
  // el entrenamiento en curso (visto en las pruebas del Usuario).
  optimizeDeps: { include: ['@tensorflow/tfjs'] },
})
