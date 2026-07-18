/**
 * confirmAsync — a cross-platform confirm dialog.
 *
 * react-native-web's Alert.alert ignores custom buttons and their callbacks,
 * so any confirm built on Alert silently does nothing on web. This uses
 * window.confirm on web and the styled Alert on native, returning a Promise
 * that resolves true (confirmed) / false (cancelled).
 */
import { Alert, Platform } from 'react-native';

export function confirmAsync(
  title: string,
  message?: string,
  opts?: { confirmText?: string; cancelText?: string; destructive?: boolean },
): Promise<boolean> {
  const confirmText = opts?.confirmText ?? 'OK';
  const cancelText = opts?.cancelText ?? 'Cancel';

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return Promise.resolve(true);
    }
    const text = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(window.confirm(text));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: opts?.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
