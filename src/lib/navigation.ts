import type { Href, Router } from 'expo-router';

/** router.back() is a no-op (with a dev warning) when there's no history — e.g.
 * after a hard refresh on web drops straight into a nested route. Falls back
 * to replacing with a known parent route instead of doing nothing. */
export function goBackOr(router: Router, fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
