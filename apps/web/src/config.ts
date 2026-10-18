/**
 * Build-time configuration. Vite replaces `import.meta.env.VITE_*` with literal values
 * when it builds the bundle, so:
 *   - these values are PUBLIC (anyone can read them in the downloaded JavaScript) —
 *     never put a secret in a VITE_ variable;
 *   - changing them requires a rebuild/redeploy of the website.
 */
function readUrl(name: string, value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  try {
    return new URL(raw).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be an absolute URL, got "${raw}"`);
  }
}

export const config = {
  apiUrl: readUrl('VITE_API_URL', import.meta.env.VITE_API_URL, 'http://localhost:4000'),
};
