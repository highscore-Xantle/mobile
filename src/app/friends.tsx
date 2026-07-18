/**
 * Friends screen — accepted friends (with live online status + one-tap
 * invite), incoming requests (accept/decline), and outgoing requests.
 * Reached from the home header's people chip.
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GradientFill } from '../components/GradientFill';
import { Avatar } from '../components/ui/Avatar';
import { useGoBackOr } from '../lib/navigation';
import { usePresence } from '../lib/usePresence';
import {
  useFriends, respondFriendRequest, removeFriend, inviteFriendToGame, type FriendRow,
} from '../lib/social';
import { colors, font, gradients, radius, shadow, space } from '../theme';

export default function FriendsScreen() {
  const goBack = useGoBackOr('/home');
  const router = useRouter();
  const { friends, loading, refresh } = useFriends();
  const { isOnline } = usePresence();
  const [busyId, setBusyId] = useState<string | null>(null);

  const accepted = friends.filter((f) => f.kind === 'accepted');
  const incoming = friends.filter((f) => f.kind === 'incoming');
  const outgoing = friends.filter((f) => f.kind === 'outgoing');

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

  const name = (f: FriendRow) => f.username || 'Player';

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]} onPress={goBack}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Friends</Text>
          <View style={styles.backBtn} />
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
                    <Text style={styles.name} numberOfLines={1}>{name(f)}</Text>
                    <View style={styles.actions}>
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
                  </View>
                ))}
              </>
            )}

            <Text style={styles.sectionLabel}>FRIENDS</Text>
            {accepted.length === 0 ? (
              <Text style={styles.empty}>No friends yet. Add someone after a match!</Text>
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
                  <Pressable style={({ pressed }) => [styles.smallBtn, styles.inviteBtn, pressed && styles.pressed]}
                    disabled={busyId === f.id}
                    onPress={() => invite(f)}>
                    {busyId === f.id
                      ? <ActivityIndicator color={colors.white} size="small" />
                      : <Text style={styles.inviteText}>Invite</Text>}
                  </Pressable>
                  <Pressable hitSlop={8} disabled={busyId === f.id}
                    onPress={() => Alert.alert(`Remove ${name(f)}?`, 'They will be removed from your friends.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => withBusy(f.id, () => removeFriend(f.id)) },
                    ])}>
                    <Text style={styles.removeGlyph}>⋯</Text>
                  </Pressable>
                </View>
              );
            })}

            {outgoing.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>SENT</Text>
                {outgoing.map((f) => (
                  <View key={f.id} style={styles.row}>
                    <Avatar letter={name(f).charAt(0)} imageUrl={f.avatar_url} size={44} />
                    <Text style={[styles.name, { flex: 1 }]} numberOfLines={1}>{name(f)}</Text>
                    <Text style={styles.pending}>Pending</Text>
                    <Pressable hitSlop={8} disabled={busyId === f.id}
                      onPress={() => withBusy(f.id, () => removeFriend(f.id))}>
                      <Text style={styles.removeGlyph}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.lg },
  backBtn: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  backGlyph: { color: colors.text, fontSize: 22, marginTop: -2 },
  title: { fontFamily: font.black, fontSize: 22, color: colors.text },
  sectionLabel: { fontFamily: font.black, fontSize: 12, color: colors.textFaint, letterSpacing: 1.2, marginTop: space.lg, marginBottom: space.sm },
  empty: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, paddingVertical: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  name: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  status: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: colors.bg },
  actions: { flexDirection: 'row', gap: space.xs, marginLeft: 'auto' },
  smallBtn: { paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline, alignItems: 'center', justifyContent: 'center' },
  acceptBtn: { backgroundColor: colors.blue, borderColor: colors.blue },
  acceptText: { fontFamily: font.bold, fontSize: 13, color: colors.white },
  declineText: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },
  inviteBtn: { backgroundColor: colors.blue, borderColor: colors.blue, minWidth: 74 },
  inviteText: { fontFamily: font.bold, fontSize: 13, color: colors.white },
  pending: { fontFamily: font.semibold, fontSize: 13, color: colors.textFaint },
  removeGlyph: { fontFamily: font.bold, fontSize: 18, color: colors.textFaint, paddingHorizontal: space.xs },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
