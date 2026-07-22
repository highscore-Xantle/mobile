/**
 * In-app confirm/alert modal — one styled dialog every confirm and alert
 * routes through, on all platforms. Replaces the browser window.alert/confirm
 * (ugly, off-brand) and react-native-web's Alert.alert (a silent no-op).
 *
 * Usage stays the same everywhere:
 *   const ok = await confirmAsync('Remove Sam?', '…', { confirmText: 'Remove', destructive: true });
 * Raw Alert.alert(...) calls are redirected here on web via installWebAlertShim().
 *
 * <ConfirmHost/> is mounted once at the app root; requests queue if several
 * fire at once.
 */
import { useSyncExternalStore } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, shadow, space } from '../theme';

type BtnStyle = 'default' | 'cancel' | 'destructive';
interface HostButton { text: string; style?: BtnStyle; onPress?: () => void }
interface Req { title?: string; message?: string; buttons: HostButton[] }

const queue: Req[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = (): Req | null => (queue.length ? queue[0] : null);

function enqueue(req: Req) { queue.push(req); emit(); }

export interface ConfirmOpts { confirmText?: string; cancelText?: string; destructive?: boolean }

/** Styled yes/no confirm. Resolves true (confirmed) / false (cancelled). */
export function confirmAsync(title: string, message?: string, opts?: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({
      title,
      message,
      buttons: [
        { text: opts?.cancelText ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: opts?.confirmText ?? 'OK', style: opts?.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
    });
  });
}

/** Alert.alert-shaped: title, message, optional buttons. Renders the modal. */
export function alertModal(title?: string, message?: string, buttons?: HostButton[]) {
  enqueue({ title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }] });
}

/** On web, redirect the no-op Alert.alert to the styled modal so every
 *  error/notice in the app actually appears (and matches the brand). */
export function installWebAlertShim(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  (Alert as any).alert = (title?: string, message?: string, buttons?: HostButton[]) =>
    alertModal(title, message, buttons);
}

export function ConfirmHost() {
  const req = useSyncExternalStore(subscribe, snapshot, snapshot);
  if (!req) return null;

  const press = (b: HostButton) => {
    // Only act if this dialog is still the front one — a rapid second click
    // on the same (still-mounted) dialog must not shift a DIFFERENT queued
    // request off the front and leave its promise unresolved.
    if (queue[0] !== req) return;
    queue.shift();
    emit();
    b.onPress?.();
  };
  const dismiss = () => press(req.buttons.find((b) => b.style === 'cancel') ?? req.buttons[req.buttons.length - 1]);
  const stacked = req.buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={s.backdrop} onPress={dismiss}>
        <Pressable style={s.card} onPress={() => {}}>
          {!!req.title && <Text style={s.title}>{req.title}</Text>}
          {!!req.message && <Text style={s.message}>{req.message}</Text>}
          <View style={[s.row, stacked && { flexDirection: 'column-reverse' }]}>
            {req.buttons.map((b, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [s.btn, stacked && s.btnStacked, b.style === 'cancel' && s.btnCancel, pressed && s.pressed]}
                onPress={() => press(b)}
              >
                <Text style={[
                  s.btnText,
                  b.style === 'destructive' && { color: colors.danger },
                  b.style === 'cancel' && { color: colors.textMuted },
                ]}>
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 360, backgroundColor: colors.surfaceSolid, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: space.xl, ...shadow.card },
  title: { fontFamily: font.extrabold, fontSize: 18, color: colors.text, textAlign: 'center' },
  message: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: space.sm },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  btn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  btnStacked: { flex: undefined, alignSelf: 'stretch' },
  btnCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.hairline },
  btnText: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
