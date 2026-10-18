import { apiErrorSchema } from '@profilesync/shared';
import express from 'express';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { silentLogger } from '../../test/helpers.js';
import { AppError } from '../lib/errors.js';
import { errorHandler } from './error-handler.js';

/** A tiny app whose only route throws whatever the test gives it. */
function appThatThrows(error: unknown) {
  const app = express();
  app.use(pinoHttp({ logger: silentLogger }));
  app.get('/boom', () => {
    throw error;
  });
  app.use(errorHandler());
  return app;
}

describe('errorHandler', () => {
  it('passes AppError status, code and message through', async () => {
    const res = await request(appThatThrows(new AppError(409, 'CONFLICT', 'Already exists'))).get(
      '/boom',
    );

    expect(res.status).toBe(409);
    expect(apiErrorSchema.parse(res.body).error).toMatchObject({
      code: 'CONFLICT',
      message: 'Already exists',
    });
  });

  it('turns Zod errors into 400 VALIDATION_FAILED with field details', async () => {
    const result = z.object({ displayName: z.string().min(1) }).safeParse({ displayName: '' });
    const res = await request(appThatThrows(result.error)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details[0].path).toBe('displayName');
  });

  it('hides the message of unexpected errors behind a generic 500', async () => {
    const res = await request(
      appThatThrows(new Error('connection string postgres://secret@db leaked')),
    ).get('/boom');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
