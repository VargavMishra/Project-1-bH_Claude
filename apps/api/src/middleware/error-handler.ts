import type { ApiError } from '@profilesync/shared';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

/** Errors produced by express.json() carry a `type` and `status`. */
type BodyParserError = Error & { type: string; status: number };

function isBodyParserError(err: unknown): err is BodyParserError {
  return err instanceof Error && 'type' in err && 'status' in err;
}

/** Converts any thrown value into an AppError with a client-safe message. */
function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return new AppError(400, 'VALIDATION_FAILED', 'Request validation failed', details);
  }

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new AppError(400, 'BAD_REQUEST', 'Request body is not valid JSON');
    }
    if (err.type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
  }

  // Unknown error: hide the details from the client; they are logged below.
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

/**
 * Centralized error handler — the single place that decides what an error looks like
 * on the wire. Express recognizes it as an error handler because it has 4 parameters.
 * Express 5 also routes errors thrown inside async handlers here automatically.
 */
export function errorHandler(): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const appError = toAppError(err);
    // The access log (pino-http, app.ts) writes one line per request including this code.
    // Only unexpected failures get an extra line, with the stack trace, for debugging.
    res.locals.errorCode = appError.code;
    if (appError.status >= 500) {
      req.log.error({ err }, 'unhandled error');
    }

    const body: ApiError = {
      error: {
        code: appError.code,
        message: appError.message,
        // pino-http types req.id loosely; our genReqId (app.ts) always returns a string.
        requestId: typeof req.id === 'string' ? req.id : 'unknown',
        ...(appError.details === undefined ? {} : { details: appError.details }),
      },
    };
    res.status(appError.status).json(body);
  };
}
