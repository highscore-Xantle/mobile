import { useEffect, useRef } from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';

/**
 * Back-navigation handler. router.canGoBack() is unreliable on the
 * expo-router version this app is on — it can report true with nowhere to
 * actually go, so router.back() then silently no-ops and the back button
 * looks dead. This verifies the route actually changed after back(); if it
 * didn't, it forces the fallback instead of leaving the user stuck.
 */
export function useGoBackOr(fallback: Href) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  return () => {
    const before = pathnameRef.current;
    router.back();
    setTimeout(() => {
      if (pathnameRef.current === before) router.replace(fallback);
    }, 250);
  };
}
