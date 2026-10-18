import type { ApiSuccess, Health } from '@profilesync/shared';
import { Router } from 'express';

/**
 * Liveness check: "is this process up and serving HTTP?" It deliberately does NOT call
 * the database, so a slow or paused database cannot make Render restart a healthy API.
 * A separate readiness check that pings Supabase is added with the database (Stage 4).
 */
export function healthRouter(version: string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const body: ApiSuccess<Health> = {
      data: {
        status: 'ok',
        version,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
