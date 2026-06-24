import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { colors } from '../theme';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.blue,
  });
}

/**
 * Whether push can be registered here. On web this needs Service Worker + Push +
 * Notification APIs (absent in e.g. older Safari / private windows). On native it
 * needs a real device — simulators/emulators can't register. When false the
 * Settings toggle stays off and disabled so it can't get stuck mid-flip.
 */
export function isPushSupported(): boolean {
  if (Platform.OS === 'web') {
    return (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    );
  }
  return Device.isDevice;
}

/** OS-level permission only — used to draw the Settings toggle without prompting. */
export async function hasNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Requests notification permission (prompting if not yet decided), then
 * registers an Expo push token against push_tokens. Returns null if the
 * user denied permission or this is a simulator/emulator (no push there).
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!isPushSupported()) return null;

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;

  try {
    let token: string;
    if (Platform.OS === 'web') {
      // Web push isn't an Expo-service token. getDevicePushTokenAsync subscribes
      // against notification.vapidPublicKey (app.json) and returns a VAPID record
      // { endpoint, keys: { p256dh, auth } }. Serialize it into the shared `token`
      // column; the send side distinguishes it from Expo tokens by shape (JSON
      // object vs. an "ExponentPushToken[...]" string).
      const { data } = await Notifications.getDevicePushTokenAsync();
      token = JSON.stringify(data);
    } else {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      ({ data: token } = await Notifications.getExpoPushTokenAsync({ projectId }));
    }

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
