import { apiErrorSchema, healthSchema } from '@profilesync/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';

const app = buildTestApp();

describe('GET /api/health', () => {
  it('returns 200 with a body matching the shared contract', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(healthSchema.parse(res.body.data).version).toBe('test');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('request IDs', () => {
  it('generates one when the client sends none', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a safe client-supplied ID', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'demo-request-0001');
    expect(res.headers['x-request-id']).toBe('demo-request-0001');
  });

  it('replaces an unsafe client-supplied ID', async () => {
    const res = await request(app).get('/api/health').set('X-Request-Id', 'bad id\twith tabs');
    expect(res.headers['x-request-id']).not.toContain('bad');
  });
});

describe('error responses', () => {
  it('returns the standard envelope for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects malformed JSON with 400 BAD_REQUEST', async () => {
    const res = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send('{"not": valid json');

    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('BAD_REQUEST');
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await request(app)
      .post('/api/anything')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ bio: 'x'.repeat(40_000) }));

    expect(res.status).toBe(413);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CORS', () => {
  it('allows the configured website origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://web.example.test');
    expect(res.headers['access-control-allow-origin']).toBe('https://web.example.test');
  });

  it('does not grant access to other origins', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
