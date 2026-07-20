import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';

/**
 * useTapLock — wrap a navigation/action handler so a rapid double-tap only
 * fires once (default 700ms). Prevents duplicate screens on the stack (which
 * break back navigation). The codebase already had ad-hoc versions of this
 * (navLockRef, gamePressLockRef); this is the shared one.
 */
export function useTapLock(fn: () => void, ms = 700): () => void {
  const lastRef = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - lastRef.current < ms) return;
    lastRef.current = now;
    fn();
  }, [fn, ms]);
}

/**
 * Back-navigation handler. router.canGoBack() is unreliable on the
 * expo-router version this app is on — it can report true with nowhere to
 * actually go, so router.back() then silently no-ops and the back button
 * looks dead. This verifies the route actually changed after back(); if it
 * didn't, it forces the fallback instead of leaving the user stuck.
 *
 * Success is detected two ways, and EITHER counts:
 *  - the pathname changed (native: navigation state updates immediately), or
 *  - this component unmounted (web: the popped screen unmounts at once, so
 *    its pathname ref would never update — treating "still mounted with the
 *    same pathname" as failure used to force-replace to the fallback after
 *    every SUCCESSFUL back on web, tearing users away from where back had
 *    correctly taken them).
 * A double-tap is absorbed too: once a back attempt is in flight, further
 * calls are ignored until it's verified, so two quick taps can't pop twice.
 */
export function useGoBackOr(fallback: Href) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const unmountedRef = useRef(false);
  useEffect(() => () => { unmountedRef.current = true; }, []);

  const inFlightRef = useRef(false);

  return () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const before = pathnameRef.current;
    router.back();
    setTimeout(() => {
      inFlightRef.current = false;
      if (unmountedRef.current) return;                       // back worked — we left
      if (pathnameRef.current === before) router.replace(fallback);
    }, 250);
  };
}
