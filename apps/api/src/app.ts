import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Config } from './config/env.js';
import { AppError } from './lib/errors.js';
import type { Logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';

export type AppDependencies = {
  config: Config;
  logger: Logger;
};

// Accept a caller-supplied request ID only if it is short and plain, so it cannot be
// used to inject fake lines into our logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Builds the Express application without starting a server. Tests call this directly
 * with Supertest; `server.ts` calls it and then listens on a port.
 *
 * Middleware runs top to bottom for every request — order matters.
 */
export function createApp({ config, logger }: AppDependencies): Express {
  const app = express();

  // Render (and most hosts) terminate HTTPS at a proxy in front of us. Trust exactly one
  // hop so `req.ip` is the real client address (needed for rate limiting later).
  app.set('trust proxy', 1);

  // 1. Request ID + access log. Every log line for this request carries the same `reqId`,
  //    and the client gets it back in `X-Request-Id` to quote in bug reports.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // One compact line per request: no headers (they can carry credentials and are noisy).
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // The error handler stores the stable error code here so it appears on the same line.
      customProps: (_req, res) => {
        const errorCode: unknown = res.locals?.errorCode;
        return typeof errorCode === 'string' ? { errorCode } : {};
      },
    }),
  );

  // 2. Security headers (nosniff, no X-Powered-By, etc.).
  app.use(helmet());

  // 3. CORS: tells BROWSERS which website origins may read our responses. It is not
  //    authentication — non-browser clients ignore it — but it stops other websites from
  //    using a visitor's browser to call our API.
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );

  // 4. JSON bodies, with a small size limit to cap memory use per request.
  app.use(express.json({ limit: '32kb' }));

  // 5. Routes.
  app.use('/api/health', healthRouter(config.version));

  // 6. Nothing matched → 404 in the standard error format.
  app.use((req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
  });

  // 7. Centralized error handler — must be registered last.
  app.use(errorHandler());

  return app;
}
