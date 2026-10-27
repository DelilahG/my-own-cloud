import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    // Integration tests share one test database, so run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
