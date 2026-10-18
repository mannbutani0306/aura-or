import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['engine/**/*.ts'],
      thresholds: {
        statements: 75,
        branches: 50,
        functions: 85,
        lines: 78,
      },
    },
  },
});
