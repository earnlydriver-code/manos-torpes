import { defineConfig } from 'vitest/config';

// Tests rápidos del engine (puros, sin DOM). El benchmark de convergencia
// vive aparte en vitest.bench.config.ts porque tarda demasiado para el ciclo normal.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
