import { z } from 'zod';

/**
 * Every API response uses one of two envelopes, so clients can handle any endpoint
 * the same way:
 *
 *   success → { "data": <payload> }
 *   failure → { "error": { "code", "message", "requestId", "details"? } }
 *
 * `code` is stable and machine-readable (clients branch on it); `message` is for humans
 * and may change wording at any time.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiSuccess<T> = { data: T };

export const healthSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
});
export type Health = z.infer<typeof healthSchema>;
