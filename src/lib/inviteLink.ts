import * as Linking from 'expo-linking';

export type InviteKind = 'pixel-rush' | 'number-duel';

/**
 * Builds a shareable invite link/QR value.
 *
 * A bare xantle:// deep link (Linking.createURL) is a dead end for anyone who
 * doesn't already have the app installed — most browsers and messaging apps
 * can't open an unregistered custom scheme at all, so the recipient just sees
 * nothing happen. When EXPO_PUBLIC_WEB_URL is configured (the deployed web
 * build's URL), links point at a /join/[code] landing page there instead —
 * that page always opens in a browser, shows the invite, and offers the
 * in-app deep link as a tap for anyone who does have the app.
 *
 * Until EXPO_PUBLIC_WEB_URL is set (no web build deployed yet), this falls
 * back to the previous xantle:// behavior unchanged.
 */
export function buildInviteLink(kind: InviteKind, code: string): string {
  const webBase = process.env.EXPO_PUBLIC_WEB_URL;
  if (webBase) {
    return `${webBase.replace(/\/$/, '')}/join/${code}?kind=${kind}`;
  }
  return Linking.createURL(kind === 'pixel-rush' ? `/game/${code}` : `/room/${code}`);
}
