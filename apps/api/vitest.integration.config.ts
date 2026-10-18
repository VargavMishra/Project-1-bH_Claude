import { defineConfig } from 'vitest/config';

// Integration tests: talk to the DEVELOPMENT Supabase project over the network,
// using credentials from apps/api/.env.test (see .env.test.example).
// Never point these at production.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    // Real network round trips: allow more time, and run files one at a time so
    // tests don't compete for auth rate limits.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
