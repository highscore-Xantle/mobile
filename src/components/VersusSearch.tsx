// Shared "searching for an opponent" visual — copied from Draughts'
// VersusJoin (src/app/game/draughts.tsx) so Number Duel and Pixel Rush's
// matchmaking screens look identical instead of a plain spinner + text.
// Real matches skip this screen entirely (the caller navigates straight into
// the game); `matched` is only ever set to settle the flashing photo onto a
// bot's identity for the brief "Opponent found!" beat before the bot match
// starts, exactly like Draughts does.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn } from 'react-native-reanimated';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { colors, font, space } from '../theme';

export type VersusPlayer = { name: string; avatar: string | null };

export const AV_POOL = Array.from({ length: 20 }, (_, i) => `https://i.pravatar.cc/150?img=${i + 1}`);
const BOT_NAMES = ['Alex Morgan', 'Sam Rivera', 'Jordan Blake', 'Riley Chen', 'Casey Kim', 'Taylor Reed', 'Jamie Cruz', 'Drew Parker', 'Quinn Lee', 'Avery Stone', 'Noah West', 'Mia Frost'];
const rand = (n: number) => Math.floor(Math.random() * n);

export function randomBotOpponent(): VersusPlayer {
  return { name: BOT_NAMES[rand(BOT_NAMES.length)], avatar: AV_POOL[rand(AV_POOL.length)] };
}

/** Current user's display identity for the "you" side of the versus card. */
export function useMyVersusProfile(): VersusPlayer {
  const { session } = useSession();
  const [me, setMe] = useState<VersusPlayer>({ name: 'You', avatar: null });
  useEffect(() => {
    if (!session?.user) return;
    supabase.from('profiles').select('username, avatar_url').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => setMe({ name: data?.username || 'You', avatar: data?.avatar_url || null }));
  }, [session?.user?.id]);
  return me;
}

function VAvatar({ uri, name, size = 92 }: { uri: string | null; name: string; size?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }} contentFit="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.extrabold, fontSize: size * 0.4, color: colors.textMuted }}>{(name?.[0] || '?').toUpperCase()}</Text>
    </View>
  );
}

export function VersusSearch({
  accent, me, matched, onCancel,
}: {
  accent: string;
  me: VersusPlayer;
  matched: VersusPlayer | null;
  onCancel: () => void;
}) {
  const [flashUri, setFlashUri] = useState(AV_POOL[0]);

  useEffect(() => {
    if (matched) return;
    const id = setInterval(() => setFlashUri(AV_POOL[rand(AV_POOL.length)]), 130);
    return () => clearInterval(id);
  }, [matched]);

  return (
    <View>
      <Text style={s.heading}>{matched ? 'Opponent found!' : 'Finding an opponent…'}</Text>
      <View style={s.versus}>
        <View style={s.vCard}>
          <VAvatar uri={me.avatar} name={me.name} size={92} />
          <Text style={s.vName} numberOfLines={1}>{me.name}</Text>
          <View style={s.joinedPill}><Text style={s.joinedText}>JOINED</Text></View>
        </View>

        <Text style={[s.bigVs, { color: accent }]}>VS</Text>

        <View style={s.vCard}>
          <Animated.View entering={FadeIn}>
            <VAvatar uri={matched ? matched.avatar : flashUri} name="?" size={92} />
          </Animated.View>
          <Text style={s.vName} numberOfLines={1}>{matched ? matched.name : 'Searching…'}</Text>
          <View style={[s.joinedPill, !matched && { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[s.joinedText, !matched && { color: colors.textMuted }]}>{matched ? 'JOINED' : 'WAITING'}</Text>
          </View>
        </View>
      </View>

      {!matched && (
        <Pressable onPress={onCancel} hitSlop={10} style={{ marginTop: space.xl, alignSelf: 'center' }}>
          <Text style={[s.cancelText, { color: accent }]}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  heading: { fontFamily: font.extrabold, fontSize: 22, color: colors.text, textAlign: 'center', marginBottom: space.xl },
  versus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vCard: { flex: 1, alignItems: 'center', gap: space.sm },
  vName: { fontFamily: font.bold, fontSize: 15, color: colors.text, maxWidth: 120 },
  bigVs: { fontFamily: font.display, fontSize: 24, paddingHorizontal: space.md },
  joinedPill: { backgroundColor: 'rgba(74,222,128,0.16)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  joinedText: { fontFamily: font.extrabold, fontSize: 10, color: colors.success, letterSpacing: 1 },
  cancelText: { fontFamily: font.bold, fontSize: 14 },
});
