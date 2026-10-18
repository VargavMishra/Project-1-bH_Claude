import { z } from 'zod';

/**
 * Reads configuration from environment variables ONCE at startup and validates it.
 *
 * Why: a missing or malformed variable should stop the server immediately with a clear
 * message, not surface hours later as a confusing runtime error. Everything else in the
 * app receives the typed `Config` object and never touches `process.env` directly.
 */
const commaSeparatedUrls = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Browser origins allowed to call the API, e.g. "https://app.example.com,http://localhost:5173".
  CORS_ORIGINS: commaSeparatedUrls.default(['http://localhost:5173']),
  // Render sets RENDER_GIT_COMMIT automatically; it tells us exactly which commit is live.
  APP_VERSION: z.string().optional(),
  RENDER_GIT_COMMIT: z.string().optional(),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  corsOrigins: string[];
  version: string;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Report which variables are wrong, never their values (they may be secrets).
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    corsOrigins: env.CORS_ORIGINS,
    version: env.APP_VERSION ?? env.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev',
  };
}
