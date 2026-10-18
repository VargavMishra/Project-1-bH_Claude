import { healthSchema, type Health } from '@profilesync/shared';
import { useEffect, useState } from 'react';
import { config } from './config.ts';
import { apiFetch, ApiRequestError } from './lib/api.ts';

type Status =
  { state: 'loading' } | { state: 'ok'; health: Health } | { state: 'error'; message: string };

/**
 * Stage 2 placeholder: proves the website can reach the API (correct URL, CORS, shared
 * contract). Replaced by the sign-in and profile screens in Stage 5.
 */
export default function App() {
  const [status, setStatus] = useState<Status>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<unknown>('/api/health', { signal: controller.signal })
      .then((data) => setStatus({ state: 'ok', health: healthSchema.parse(data) }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof ApiRequestError ? err.message : 'Unexpected error';
        setStatus({ state: 'error', message });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <h1>ProfileSync</h1>
      <p className="muted">One profile, synchronized across the website and the Android app.</p>

      <section className="card" aria-live="polite">
        <h2>API status</h2>
        {status.state === 'loading' && <p>Checking {config.apiUrl} …</p>}
        {status.state === 'ok' && (
          <p className="ok">
            Connected · version <code>{status.health.version}</code>
          </p>
        )}
        {status.state === 'error' && <p className="error">Not reachable: {status.message}</p>}
      </section>
    </main>
  );
}
