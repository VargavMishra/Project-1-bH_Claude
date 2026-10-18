import { pino, type Logger } from 'pino';
import type { Config } from '../config/env.js';

export type { Logger };

/**
 * Structured JSON logger. One log line = one JSON object, which Render's log viewer
 * (and any log service) can search by field, e.g. `"event":"profile.updated"`.
 *
 * `redact` removes credentials before anything is written. Never log access tokens,
 * cookies, passwords, or full profile contents.
 */
export function createLogger(level: Config['logLevel']): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
      ],
      censor: '[REDACTED]',
    },
  });
}
