/**
 * IncomingInvitePrompt — global listener that surfaces a friend's direct
 * game invite as an accept/decline card. Mounted in the tabs layout so it
 * shows across the app's main screens, but not inside a live game.
 *
 * Accept → mark the invite accepted, join the room, navigate to its lobby.
 * Decline → mark declined; the card dismisses.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useIncomingInvites, respondGameInvite, type GameInvite } from '../lib/social';
import { GradientFill } from './GradientFill';
import { Avatar } from './ui/Avatar';
import { colors, font, gradients, radius, shadow, space } from '../theme';

const GAME_LABEL: Record<string, string> = {
  'number-duel': 'Number Duel',
  'pixel-rush': 'Pixel Rush',
  draughts: 'Draughts',
};

export function IncomingInvitePrompt() {
  const router = useRouter();
  const { invites, refresh } = useIncomingInvites();
  const [inviter, setInviter] = useState<{ username: string | null; avatar_url: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Show the newest not-yet-dismissed invite.
  const invite: GameInvite | undefined = invites.find((i) => !dismissed.has(i.id));

  useEffect(() => {
    // Clear immediately so a queued second invite never renders the PREVIOUS
    // inviter's name/photo while this one's profile is still loading.
    setInviter(null);
    if (!invite) return;
    let active = true;
    supabase.from('profiles').select('username, avatar_url').eq('id', invite.from_user).maybeSingle()
      .then(({ data }) => { if (active) setInviter(data ?? { username: null, avatar_url: null }); });
    return () => { active = false; };
  }, [invite?.id]);

  if (!invite) return null;

  const accept = async () => {
    setBusy(true);
    // Mark accepted, then navigate to the lobby — the room screen auto-joins
    // the invitee and surfaces its own error if the room is gone/full, so we
    // don't swallow a join failure into a dead "accepted but never joined"
    // state here.
    try { await respondGameInvite(invite.id, true); } catch { /* best-effort */ }
    setDismissed((prev) => new Set(prev).add(invite.id));
    setBusy(false);
    router.push(`/room/${invite.room_code}` as any);
    refresh();
  };

  const decline = async () => {
    setDismissed((prev) => new Set(prev).add(invite.id));
    try { await respondGameInvite(invite.id, false); } catch { /* best-effort */ }
    refresh();
  };

  const name = inviter?.username || 'A friend';

  return (
    <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.wrap} pointerEvents="box-none">
      <View style={styles.card}>
        <Avatar letter={name.charAt(0)} imageUrl={inviter?.avatar_url ?? null} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{name} invited you</Text>
          <Text style={styles.sub}>{GAME_LABEL[invite.game_kind] ?? invite.game_kind}</Text>
        </View>
        <Pressable style={({ pressed }) => [styles.decline, pressed && styles.pressed]} onPress={decline} disabled={busy}>
          <Text style={styles.declineText}>Later</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.accept, pressed && styles.pressed]} onPress={accept} disabled={busy}>
          <GradientFill colors={gradients.button} />
          {busy ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.acceptText}>Join</Text>}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md, top: 54, zIndex: 100 },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.hairline, padding: space.md, ...shadow.card },
  title: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  sub: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  decline: { paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline },
  declineText: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },
  accept: { paddingHorizontal: space.lg, paddingVertical: 10, borderRadius: radius.md, overflow: 'hidden', minWidth: 64, alignItems: 'center' },
  acceptText: { fontFamily: font.bold, fontSize: 13, color: colors.white },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
