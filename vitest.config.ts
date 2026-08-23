import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Matches the `paths` entry in tsconfig.json, so modules that use the
      // `@/` prefix can be imported directly by the tests.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The recogniser tests render and decode a few hundred synthetic photos.
    testTimeout: 120_000,
  },
});
