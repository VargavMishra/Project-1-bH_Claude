import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './lib/logger.js';

/**
 * Process entry point: load config, build the app, listen, and shut down cleanly.
 * Kept tiny so that everything testable lives in app.ts.
 */
const config = loadConfig();
const logger = createLogger(config.logLevel);
const app = createApp({ config, logger });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv, version: config.version }, 'API listening');
});

// Render sends SIGTERM before replacing an instance during a deploy. Stop accepting new
// connections, let in-flight requests finish, then exit. Force-exit if that takes too long.
function shutdown(signal: NodeJS.Signals) {
  logger.info({ signal }, 'shutting down');
  server.close((err) => {
    if (err) logger.error({ err }, 'error during shutdown');
    process.exit(err ? 1 : 0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
