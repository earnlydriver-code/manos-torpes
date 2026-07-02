import { defineConfig } from 'vitest/config';

// Benchmark de convergencia (criterio de éxito de la Fase 2 de la spec):
// desde azar, <2000 generaciones y <2 min deben producir pulso estable y escala reconocible.
// Se corre con `npm run bench`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__bench__/**/*.test.ts'],
    testTimeout: 300_000,
  },
});
