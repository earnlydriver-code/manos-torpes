import { defineConfig } from 'vitest/config';

// Tests rápidos del engine (puros, sin DOM). El benchmark de convergencia
// vive aparte en vitest.bench.config.ts porque tarda demasiado para el ciclo normal.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // Los tests del GA corren cientos de generaciones y compiten por CPU en
    // paralelo: el límite por defecto (5 s) daba timeouts falsos, no bugs.
    testTimeout: 120_000,
  },
});
