import { apiErrorSchema, type ErrorCode } from '@profilesync/shared';
import { config } from '../config.ts';

/** Error thrown for any non-2xx API response, carrying the server's stable error code. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/**
 * Minimal typed fetch wrapper: sends JSON, unwraps `{ data }`, and converts the
 * `{ error }` envelope into an ApiRequestError. Auth headers are added in Stage 5.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiRequestError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection.',
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, requestId } = parsed.data.error;
      throw new ApiRequestError(response.status, code, message, requestId);
    }
    throw new ApiRequestError(
      response.status,
      'INTERNAL_ERROR',
      `Unexpected response (${response.status})`,
    );
  }

  return (body as { data: T }).data;
}
