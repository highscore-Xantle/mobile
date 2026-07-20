/**
 * confirmAsync — a cross-platform confirm dialog.
 *
 * react-native-web's Alert.alert ignores custom buttons and their callbacks,
 * so any confirm built on Alert silently does nothing on web. This uses
 * window.confirm on web and the styled Alert on native, returning a Promise
 * that resolves true (confirmed) / false (cancelled).
 */
import { Alert, Platform } from 'react-native';

/**
 * installWebAlertShim — react-native-web's Alert.alert is literally
 * `static alert() {}` (a total no-op), so every error message, confirm and
 * notice in the app was invisible on the deployed web build. Called once at
 * app boot (root layout): replaces Alert.alert on web with a
 * window.alert/window.confirm implementation that honors button callbacks.
 */
export function installWebAlertShim(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  (Alert as any).alert = (
    title?: string,
    message?: string,
    buttons?: { text?: string; style?: string; onPress?: () => void }[],
  ) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    // Two+ buttons → confirm. The non-cancel button is the affirmative.
    const confirmBtn = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    const ok = window.confirm(text);
    (ok ? confirmBtn : cancelBtn)?.onPress?.();
  };
}

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
