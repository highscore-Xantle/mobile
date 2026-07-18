/**
 * Friends screen — your friends (with live online status + one-tap invite)
 * and incoming requests. Adding a friend is code-based: tap "Add Friend" to
 * copy your own code or paste someone else's.
 *
 * The flow is silent to the sender: sending a request shows no "accepted /
 * declined" — an accepted request just appears in your list, and one that's
 * never accepted (e.g. sent to a bot) simply never appears.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { GradientFill } from '../components/GradientFill';
import { Avatar } from '../components/ui/Avatar';
import { useGoBackOr } from '../lib/navigation';
import { usePresence } from '../lib/usePresence';
import { confirmAsync } from '../lib/confirm';
import {
  useFriends, respondFriendRequest, removeFriend, inviteFriendToGame,
  getMyFriendCode, addFriendByCode, type FriendRow,
} from '../lib/social';
import { colors, font, gradients, radius, shadow, space } from '../theme';

export default function FriendsScreen() {
  const goBack = useGoBackOr('/home');
  const router = useRouter();
  const { friends, loading, refresh } = useFriends();
  const { isOnline } = usePresence();
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const accepted = friends.filter((f) => f.kind === 'accepted');
  const incoming = friends.filter((f) => f.kind === 'incoming');

  const withBusy = useCallback(async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try { await fn(); await refresh(); }
    catch (e) { Alert.alert('Something went wrong', (e as Error).message); }
    finally { setBusyId(null); }
  }, [refresh]);

  const invite = (f: FriendRow) => withBusy(f.id, async () => {
    const code = await inviteFriendToGame(f.id, 'number-duel');
    router.push(`/room/${code}` as any);
  });

  const openAdd = async () => {
    setAddOpen(true);
    setAddMsg(null);
    setCodeInput('');
    if (!myCode) {
      try { setMyCode(await getMyFriendCode()); } catch { setMyCode('—'); }
    }
  };

  const copyCode = async () => {
    if (!myCode) return;
    await Clipboard.setStringAsync(myCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const submitCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) { setAddMsg('Enter a valid code.'); return; }
    setAdding(true);
    setAddMsg(null);
    try {
      await addFriendByCode(code);
      setAddMsg('Request sent! They\'ll appear here once added.');
      setCodeInput('');
      refresh();
    } catch (e) {
      setAddMsg((e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const name = (f: FriendRow) => f.username || 'Player';

  const confirmRemove = (f: FriendRow) =>
    confirmAsync(`Remove ${name(f)}?`, 'They will be removed from your friends.', { confirmText: 'Remove', destructive: true })
      .then((ok) => { if (ok) withBusy(f.id, () => removeFriend(f.id)); });

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={goBack}>
            <FontAwesome name="chevron-left" size={16} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>Friends</Text>
          <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={openAdd} accessibilityLabel="Add friend">
            <FontAwesome name="user-plus" size={16} color={colors.text} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.blue} style={{ marginTop: space.xxl }} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
            {incoming.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>REQUESTS</Text>
                {incoming.map((f) => (
                  <View key={f.id} style={styles.row}>
                    <Avatar letter={name(f).charAt(0)} imageUrl={f.avatar_url} size={44} />
                    <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{name(f)}</Text>
                    <Pressable style={({ pressed }) => [styles.smallBtn, styles.acceptBtn, pressed && styles.pressed]}
                      disabled={busyId === f.id}
                      onPress={() => withBusy(f.id, () => respondFriendRequest(f.id, true))}>
                      <Text style={styles.acceptText}>Accept</Text>
                    </Pressable>
                    <Pressable style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                      disabled={busyId === f.id}
                      onPress={() => withBusy(f.id, () => respondFriendRequest(f.id, false))}>
                      <Text style={styles.declineText}>Decline</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            <Text style={styles.sectionLabel}>FRIENDS</Text>
            {accepted.length === 0 ? (
              <Text style={styles.empty}>No friends yet. Tap the + to add one with a code.</Text>
            ) : accepted.map((f) => {
              const online = isOnline(f.id);
              return (
                <View key={f.id} style={styles.row}>
                  <View>
                    <Avatar letter={name(f).charAt(0)} imageUrl={f.avatar_url} size={44} />
                    <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.textFaint }]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{name(f)}</Text>
                    <Text style={styles.status}>{online ? 'Online' : 'Offline'}</Text>
                  </View>
                  {online && (
                    <Pressable style={({ pressed }) => [styles.smallBtn, styles.inviteBtn, pressed && styles.pressed]}
                      disabled={busyId === f.id}
                      onPress={() => invite(f)}>
                      {busyId === f.id ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.inviteText}>Invite</Text>}
                    </Pressable>
                  )}
                  <Pressable hitSlop={8} disabled={busyId === f.id} onPress={() => confirmRemove(f)}>
                    <FontAwesome name="ellipsis-h" size={16} color={colors.textFaint} style={{ paddingHorizontal: space.xs }} />
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* Add Friend modal — copy your code / paste theirs */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Add a Friend</Text>

            <Text style={styles.modalLabel}>YOUR CODE</Text>
            <Pressable style={({ pressed }) => [styles.codeBox, pressed && styles.pressed]} onPress={copyCode}>
              <Text style={styles.codeText}>{myCode ?? '••••••'}</Text>
              <View style={styles.copyPill}>
                <FontAwesome name={copied ? 'check' : 'copy'} size={13} color={copied ? colors.success : colors.blue} />
                <Text style={[styles.copyText, copied && { color: colors.success }]}>{copied ? 'Copied' : 'Copy'}</Text>
              </View>
            </Pressable>

            <Text style={[styles.modalLabel, { marginTop: space.lg }]}>ADD BY CODE</Text>
            <View style={styles.pasteRow}>
              <TextInput
                style={styles.pasteInput}
                placeholder="Paste a code"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="characters"
                autoCorrect={false}
                value={codeInput}
                onChangeText={(v) => { setCodeInput(v); if (addMsg) setAddMsg(null); }}
                maxLength={6}
              />
              <Pressable style={({ pressed }) => [styles.addBtn, (adding || codeInput.trim().length < 4) && styles.addBtnDisabled, pressed && styles.pressed]}
                disabled={adding || codeInput.trim().length < 4} onPress={submitCode}>
                {adding ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.addBtnText}>Add</Text>}
              </Pressable>
            </View>
            {addMsg && <Text style={styles.addMsg}>{addMsg}</Text>}

            <Pressable style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]} onPress={() => setAddOpen(false)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.lg },
  iconBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  title: { fontFamily: font.black, fontSize: 22, color: colors.text },
  sectionLabel: { fontFamily: font.black, fontSize: 12, color: colors.textFaint, letterSpacing: 1.2, marginTop: space.lg, marginBottom: space.sm },
  empty: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  name: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  status: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: colors.bg },
  smallBtn: { paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  acceptBtn: { backgroundColor: colors.blue, borderColor: colors.blue },
  acceptText: { fontFamily: font.bold, fontSize: 13, color: colors.white },
  declineText: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },
  inviteBtn: { backgroundColor: colors.blue, borderColor: colors.blue, minWidth: 74 },
  inviteText: { fontFamily: font.bold, fontSize: 13, color: colors.white },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: colors.surfaceSolid, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: space.xl, ...shadow.card },
  modalTitle: { fontFamily: font.display, fontSize: 22, color: colors.text, marginBottom: space.lg },
  modalLabel: { fontFamily: font.black, fontSize: 11, color: colors.textFaint, letterSpacing: 1.2, marginBottom: space.xs },
  codeBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  codeText: { fontFamily: font.display, fontSize: 26, color: colors.text, letterSpacing: 4 },
  copyPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  copyText: { fontFamily: font.bold, fontSize: 13, color: colors.blue },
  pasteRow: { flexDirection: 'row', gap: space.sm },
  pasteInput: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, fontFamily: font.display, fontSize: 18, letterSpacing: 2, color: colors.text },
  addBtn: { paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', minWidth: 68 },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { fontFamily: font.bold, fontSize: 15, color: colors.white },
  addMsg: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, marginTop: space.sm },
  doneBtn: { marginTop: space.xl, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center' },
  doneText: { fontFamily: font.bold, fontSize: 15, color: colors.text },
});
