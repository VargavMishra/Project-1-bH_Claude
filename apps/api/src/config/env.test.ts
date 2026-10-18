import { describe, expect, it } from 'vitest';
import { loadConfig } from './env.js';

describe('loadConfig', () => {
  it('applies safe defaults for local development', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 4000,
      corsOrigins: ['http://localhost:5173'],
      version: 'dev',
    });
  });

  it('parses a comma-separated CORS list', () => {
    const config = loadConfig({ CORS_ORIGINS: 'https://a.example, https://b.example' });
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('uses the short Render commit SHA as the version', () => {
    expect(loadConfig({ RENDER_GIT_COMMIT: 'abcdef1234567890' }).version).toBe('abcdef1');
  });

  it('fails fast on invalid values and names the variable, not the value', () => {
    expect(() => loadConfig({ PORT: 'not-a-port', CORS_ORIGINS: 'ftp://nope' })).toThrow(
      /PORT[\s\S]*CORS_ORIGINS/,
    );
    expect(() => loadConfig({ CORS_ORIGINS: 'ftp://nope' })).not.toThrow(/ftp:\/\/nope/);
  });
});
