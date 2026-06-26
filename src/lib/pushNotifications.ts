import { requireOptionalNativeModule } from 'expo-modules-core';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { colors } from '../theme';
import { supabase } from './supabase';

// `expo-notifications` resolves a native module (ExpoPushTokenManager) at import
// time, which throws on web and on any build that predates the module being
// added (e.g. an older dev client). A static `import` would therefore crash the
// whole app at startup just by loading this file. So we require it lazily and
// only on a supported native platform, caching the module and one-time handler.
type NotificationsModule = typeof import('expo-notifications');
let cached: NotificationsModule | null = null;
let handlerSet = false;

function getNotifications(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  if (cached) return cached;
  // Feature-detect the native module WITHOUT importing expo-notifications.
  // Importing the package eagerly resolves ExpoPushTokenManager, and Metro
  // logs a red error when that module is absent (a dev client built before
  // push was added) — even if we catch the throw. requireOptionalNativeModule
  // returns null instead of throwing/logging, so we bail before requiring.
  if (!requireOptionalNativeModule('ExpoPushTokenManager')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-notifications') as NotificationsModule;
    if (!handlerSet) {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerSet = true;
    }
    cached = mod;
    return mod;
  } catch {
    return null; // native module not present in this build
  }
}

async function ensureAndroidChannel(Notifications: NotificationsModule) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.blue,
  });
}

/**
 * Push is Android/iOS only (spec'd scope — see push_tokens migration). Web has no
 * CORS-friendly push token endpoint and simulators/emulators can't register, so
 * the Settings toggle must stay off and disabled on those — otherwise it can be
 * switched off but never back on. Also false when the native module isn't in the
 * current build, so the toggle disables gracefully instead of crashing.
 */
export function isPushSupported(): boolean {
  return Device.isDevice && Platform.OS !== 'web' && getNotifications() !== null;
}

/** OS-level permission only — used to draw the Settings toggle without prompting. */
export async function hasNotificationPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Device.isDevice || !Notifications) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Requests notification permission (prompting if not yet decided), then
 * registers an Expo push token against push_tokens. Returns null if the
 * user denied permission or this is a simulator/emulator (no push there).
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  const Notifications = getNotifications();
  if (!isPushSupported() || !Notifications) return null;

  await ensureAndroidChannel(Notifications);

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, updated_at: new Date().toISOString() });

    return token;
  } catch (err) {
    console.warn('[pushNotifications] registration failed:', err);
    return null;
  }
}

/** Drops the stored token — used when the Settings toggle is switched off. */
export async function unregisterPushNotifications(userId: string): Promise<void> {
  await supabase.from('push_tokens').delete().eq('user_id', userId);
}
