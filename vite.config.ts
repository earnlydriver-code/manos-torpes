import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // El worker de entrenamiento importa módulos de engine/; formato ES para
  // que el build de producción no caiga al fallback IIFE.
  worker: { format: 'es' },
  // TF.js y Magenta se cargan por import dinámico: sin pre-bundle, el dev
  // server los optimiza a mitad de sesión y RECARGA la página — al usuario le
  // aparecía "Unexpected token" (HTML servido en lugar del módulo) o moría el
  // entrenamiento LSTM en curso.
  optimizeDeps: { include: ['@tensorflow/tfjs', '@magenta/music/es6/music_rnn'] },
})
