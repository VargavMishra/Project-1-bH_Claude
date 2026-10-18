import { describe, expect, it } from 'vitest';
import { apiErrorSchema, healthSchema } from './api.js';

describe('apiErrorSchema', () => {
  it('accepts a well-formed error envelope', () => {
    const result = apiErrorSchema.safeParse({
      error: { code: 'NOT_FOUND', message: 'Route not found', requestId: 'abc' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown error codes so clients can rely on the list', () => {
    const result = apiErrorSchema.safeParse({
      error: { code: 'SOMETHING_ELSE', message: 'x', requestId: 'abc' },
    });
    expect(result.success).toBe(false);
  });
});

describe('healthSchema', () => {
  it('requires an ISO timestamp', () => {
    const base = { status: 'ok', version: '0.1.0', uptimeSeconds: 3 };
    expect(healthSchema.safeParse({ ...base, timestamp: new Date().toISOString() }).success).toBe(
      true,
    );
    expect(healthSchema.safeParse({ ...base, timestamp: 'yesterday' }).success).toBe(false);
  });
});
