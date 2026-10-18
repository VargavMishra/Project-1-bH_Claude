/**
 * The website URL the app loads. `EXPO_PUBLIC_*` variables are inlined into the app
 * bundle at BUILD time (by EAS Build in the cloud, from eas.json / EAS environment
 * variables), so the installed APK never depends on a developer's computer.
 *
 * Returns null when not configured; the app then shows a configuration error instead
 * of silently loading the wrong site.
 */
function readWebUrl(): URL | null {
  const raw = process.env.EXPO_PUBLIC_WEB_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

export const webUrl = readWebUrl();
