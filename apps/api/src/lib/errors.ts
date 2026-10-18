import type { ErrorCode } from '@profilesync/shared';

/**
 * An error we raised on purpose, with the HTTP status and stable code the client
 * should see. Anything that is NOT an AppError is treated as an unexpected bug and
 * becomes a generic 500 (its message is logged, never sent to the client).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);
