import { createApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';

export const silentLogger = createLogger('silent');

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({ NODE_ENV: 'test', CORS_ORIGINS: 'https://web.example.test' }),
    version: 'test',
    ...overrides,
  };
}

export function buildTestApp(overrides: Partial<Config> = {}) {
  return createApp({ config: testConfig(overrides), logger: silentLogger });
}
