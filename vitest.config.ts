import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The recogniser tests render and decode a few hundred synthetic photos.
    testTimeout: 120_000,
  },
});
