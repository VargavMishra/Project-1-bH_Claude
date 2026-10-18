import { defineConfig } from 'vitest/config';

// Unit + in-process HTTP tests. Fast, no network, no credentials needed.
// Integration tests against a real Supabase project: see vitest.integration.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['test/integration/**', '**/node_modules/**'],
  },
});
