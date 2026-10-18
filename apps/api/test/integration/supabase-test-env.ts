import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

/**
 * Shared setup for integration tests against the development Supabase project.
 *
 * Safety: tests only ever touch users they create here (random e-mail addresses) and
 * delete them afterwards, so they never read or modify anyone else's data.
 */
const envFile = fileURLToPath(new URL('../../.env.test', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const parsed = z
  .object({
    SUPABASE_URL: z.url({ protocol: /^https$/ }),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
    SUPABASE_SECRET_KEY: z.string().min(20),
  })
  .safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(
    `Integration tests need ${missing}. Copy apps/api/.env.test.example to apps/api/.env.test ` +
      'and fill in the DEVELOPMENT project values.',
  );
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to run integration tests with NODE_ENV=production.');
}

export const env = parsed.data;

const noSession = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};

/** Privileged client (secret key): bypasses RLS. Used only to set up/clean up test users. */
export const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, noSession);

/** A client exactly like the website/API would use: public key, no user signed in. */
export function publicClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, noSession);
}

export type TestUser = { id: string; client: ReturnType<typeof publicClient> };

/** Creates a confirmed throwaway user and returns a client signed in as that user. */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `it-${label}-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString('base64url'); // generated per run, never logged

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;

  const client = publicClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;

  return { id: created.data.user.id, client };
}

export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw error;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
