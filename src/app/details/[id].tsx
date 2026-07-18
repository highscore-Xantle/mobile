// Game detail screen (product-page layout). Themed hero + title + description,
// plus 4 SELECTABLE play modes (per game) that drive the bottom CTA (label +
// price) - the same interactive pattern for every playable game, not just
// Draughts. Games without a MODES_BY_GAME entry (e.g. an unreleased game)
// fall back to a static feature grid instead.
//
// Mode wiring:
//   online → whatever that game's own real entry point already does
//            (its dedicated screen if it has one, else /setup/[id])
//   invite → games on the generic `rooms` schema (Draughts, Number Duel)
//            create a room here directly and jump to the lobby; games with
//            their own dedicated screen (Pixel Rush) defer to it instead,
//            since it already has a real invite flow built in
//   group  → $2 premium, not wired up yet (payment is a later stage)
//   join   → shared JoinModal (already tries join_game then join_room, so
//            it works for every game's schema without branching here)
import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { GradientFill } from '../../components/GradientFill';
import { JoinModal } from '../../components/JoinModal';
import { GAMES } from '../(tabs)/games';
import { colors, font, radius, shadow, space } from '../../theme';

type FAIcon = React.ComponentProps<typeof FontAwesome>['name'];

const SCREEN_H = Dimensions.get('window').height;
const HERO_H = Math.round(SCREEN_H * 0.46);

const META_BY_GAME: Record<string, { label: string; value: string }[]> = {
  draughts: [
    { label: 'TYPE', value: 'Board' },
    { label: 'STYLE', value: 'Strategy' },
    { label: 'PACE', value: 'Turn-based' },
  ],
  'number-duel': [
    { label: 'TYPE', value: 'Mind Game' },
    { label: 'STYLE', value: 'Guess & Deduce' },
    { label: 'PACE', value: 'Fast-paced' },
  ],
  'pixel-rush': [
    { label: 'TYPE', value: 'Arcade' },
    { label: 'STYLE', value: 'Speed Puzzle' },
    { label: 'PACE', value: 'Real-time' },
  ],
  spy: [
    { label: 'TYPE', value: 'Party' },
    { label: 'STYLE', value: 'Social Deduction' },
    { label: 'PACE', value: 'Group' },
  ],
};

type Mode = 'online' | 'invite' | 'group' | 'join';
interface ModeDef { key: Mode; icon: FAIcon; title: string; sub: string; cta: string; price: string; }

const MODES_BY_GAME: Record<string, ModeDef[]> = {
  draughts: [
    { key: 'online', icon: 'globe',     title: 'Play Online',    sub: 'Match with anyone',     cta: 'Play',     price: 'Free' },
    { key: 'invite', icon: 'user-plus', title: 'Invite a Friend', sub: 'Play someone you know', cta: 'Invite',  price: 'Free' },
    { key: 'group',  icon: 'users',     title: 'Group',          sub: 'Up to 8 players',       cta: 'Create',   price: '$2' },
    { key: 'join',   icon: 'sign-in',   title: 'Join a Game',    sub: 'Enter an invite code',  cta: 'Join now', price: 'Free' },
  ],
  'number-duel': [
    { key: 'online', icon: 'globe',     title: 'Play Online',    sub: 'Match with anyone',      cta: 'Play',     price: 'Free' },
    { key: 'invite', icon: 'user-plus', title: 'Invite a Friend', sub: 'Invite',                 cta: 'Invite',  price: 'Free' },
    { key: 'group',  icon: 'users',     title: 'Group',          sub: 'Up to 8 players',        cta: 'Create',   price: '$2' },
    { key: 'join',   icon: 'sign-in',   title: 'Join a Game',    sub: 'Enter an invite code',   cta: 'Join now', price: 'Free' },
  ],
  'pixel-rush': [
    { key: 'online', icon: 'globe',     title: 'Play Online',    sub: '1v1 or vs the machine',  cta: 'Play',     price: 'Free' },
    { key: 'invite', icon: 'user-plus', title: 'Invite a Friend', sub: 'Private 1v1 by code',    cta: 'Invite',  price: 'Free' },
    { key: 'group',  icon: 'users',     title: 'Group',          sub: 'Up to 8 players',        cta: 'Create',   price: '$2' },
    { key: 'join',   icon: 'sign-in',   title: 'Join a Game',    sub: 'Enter an invite code',   cta: 'Join now', price: 'Free' },
  ],
};

// Static fallback for games with no MODES_BY_GAME entry (e.g. unreleased ones).
const FEATURES: { icon: FAIcon; title: string; sub: string }[] = [
  { icon: 'bolt', title: 'Fast Rounds', sub: 'Quick to play' },
  { icon: 'star', title: 'Rankings', sub: 'Climb the board' },
  { icon: 'users', title: 'Multiplayer', sub: 'Play friends' },
];

export default function GameDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const game = GAMES.find((g) => g.id === id);

  const modes = game ? MODES_BY_GAME[game.id] : undefined;
  const meta = game ? (META_BY_GAME[game.id] ?? []) : [];
  const [mode, setMode] = useState<Mode>('online');
  const [joinVisible, setJoinVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  // Double-tapping the CTA pushed the target screen twice — two stacked
  // matchmaking screens each created a lobby and armed a bot-fallback timer,
  // and the buried one could later hijack navigation out of the live match.
  const navLockRef = useRef(0);

  if (!game) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.text }}>Game not found.</Text>
      </View>
    );
  }

  const selected = modes?.find((m) => m.key === mode);

  // The generic entry point every game already has: its own dedicated screen
  // if it built one (Pixel Rush), else the shared /setup/[id] configure-and-play flow.
  const playSimple = () => {
    if (!game.available) return;
    if (game.route) router.push(game.route as Parameters<typeof router.push>[0]);
    else router.push(`/setup/${game.id}` as any);
  };

  // rooms-schema games (Draughts, Number Duel) with no dedicated screen of
  // their own: create a private room here directly and jump to its lobby.
  const createRoom = async () => {
    setBusy(true);
    const { data: room, error } = await supabase.rpc('create_room', {
      p_game_kind: game.id, p_state: {}, p_is_group: false, p_max: 2,
    });
    setBusy(false);
    if (error || !room) { Alert.alert('Could not start', error?.message ?? 'Please try again.'); return; }
    router.push(`/room/${room.code}` as any);
  };

  const handleCta = () => {
    if (busy) return;
    const now = Date.now();
    if (now - navLockRef.current < 1000) return;
    if (mode === 'online') {
      navLockRef.current = now;   // only navigation branches arm the lock —
      // the group alert / join modal don't navigate, and arming there
      // swallowed a legitimate CTA tap made right after dismissing them.
      // Draughts and Number Duel matchmake straight into a live match (or a
      // bot after a short wait) with default rules — same "Play Online"
      // pattern for both. Custom rules live under "Invite a Friend" instead.
      if (game.id === 'draughts') { router.push('/game/draughts?mp=online' as any); return; }
      if (game.id === 'number-duel') { router.push('/game/number-duel?mp=online' as any); return; }
      playSimple();
      return;
    }
    if (mode === 'invite') {
      navLockRef.current = now;
      if (game.route) { playSimple(); return; }  // has its own invite flow already
      // Number Duel: let the host configure difficulty + rounds first, then
      // create the room from the setup screen (was creating instantly with
      // default rules, so "these rules were chosen by the host" was a lie).
      if (game.id === 'number-duel') { router.push('/setup/number-duel' as any); return; }
      createRoom();
      return;
    }
    if (mode === 'group') { Alert.alert('Group play', 'Group games ($2) are coming soon.'); return; }
    if (mode === 'join') { setJoinVisible(true); return; }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 170 }}
        bounces={false}
        overScrollMode="never"
      >
        {/* Hero */}
        <View style={styles.hero}>
          <GradientFill colors={game.theme} />
          <SafeAreaView edges={['top']}>
            <View style={styles.heroHeader}>
              <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={() => router.back()}>
                <FontAwesome name="chevron-left" size={16} color={colors.white} />
              </Pressable>
              <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={() => {}}>
                <FontAwesome name="bookmark-o" size={16} color={colors.white} />
              </Pressable>
            </View>
          </SafeAreaView>

          <Animated.View entering={FadeInDown.delay(120).springify().damping(16)} style={styles.meta}>
            {meta.map((m) => (
              <View key={m.label} style={styles.metaRow}>
                <Text style={styles.metaLabel}>{m.label}</Text>
                <Text style={styles.metaValue}>{m.value}</Text>
              </View>
            ))}
          </Animated.View>

          <Animated.View entering={FadeIn.delay(80).duration(500)} style={styles.heroImgWrap}>
            {game.image
              ? <Image source={game.image} style={styles.heroImg} contentFit="contain" />
              : <Text style={{ fontSize: 120 }}>{game.emoji}</Text>}
          </Animated.View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <Animated.Text entering={FadeInDown.delay(160).springify()} style={styles.title}>{game.title}</Animated.Text>
          <Animated.Text entering={FadeInDown.delay(220).springify()} style={styles.desc}>
            {game.tagline} Placeholder description — replace with the real copy.
          </Animated.Text>

          {modes && <Text style={styles.sectionLabel}>HOW DO YOU WANT TO PLAY?</Text>}

          <View style={styles.grid}>
            {modes
              ? modes.map((m, i) => {
                  const on = m.key === mode;
                  return (
                    <Animated.View key={m.key} entering={FadeInDown.delay(280 + i * 60).springify().damping(15)} style={{ width: '47%', flexGrow: 1 }}>
                      <Pressable
                        onPress={() => setMode(m.key)}
                        style={({ pressed }) => [
                          styles.chip,
                          on && { borderColor: game.accent, borderWidth: 2, backgroundColor: colors.surfaceAlt },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.chipIcon, { backgroundColor: on ? game.accent : colors.surfaceAlt }]}>
                          <FontAwesome name={m.icon} size={15} color={on ? colors.white : colors.textMuted} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.chipTitle} numberOfLines={1}>{m.title}</Text>
                          <Text style={styles.chipSub} numberOfLines={1}>{m.sub}</Text>
                        </View>
                        {m.price !== 'Free' && <Text style={[styles.chipPrice, { color: game.accent }]}>{m.price}</Text>}
                      </Pressable>
                    </Animated.View>
                  );
                })
              : FEATURES.map((f, i) => (
                  <Animated.View key={f.title} entering={FadeInDown.delay(280 + i * 60).springify().damping(15)} style={styles.chip}>
                    <View style={[styles.chipIcon, { backgroundColor: game.accent }]}>
                      <FontAwesome name={f.icon} size={15} color={colors.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chipTitle} numberOfLines={1}>{f.title}</Text>
                      <Text style={styles.chipSub} numberOfLines={1}>{f.sub}</Text>
                    </View>
                  </Animated.View>
                ))}
          </View>
        </View>
      </ScrollView>

      {/* Bottom bar — reflects the selected mode */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.priceLabel}>{selected ? selected.title.toUpperCase() : 'PRICE'}</Text>
          <Text style={styles.price}>{selected ? selected.price : 'Free'}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.cta, !game.available && styles.ctaDisabled, pressed && styles.pressed]}
          onPress={modes ? handleCta : playSimple}
          disabled={!game.available || busy}
        >
          <View style={styles.ctaInner}>
            <GradientFill colors={game.theme} />
            {busy ? <ActivityIndicator color={colors.white} /> : (
              <>
                <Text style={styles.ctaText}>{game.available ? (selected ? selected.cta : 'Play') : 'Coming soon'}</Text>
                {game.available && <FontAwesome name="arrow-right" size={14} color={colors.white} />}
              </>
            )}
          </View>
        </Pressable>
      </View>

      <JoinModal visible={joinVisible} onClose={() => setJoinVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { height: HERO_H, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, overflow: 'hidden' },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  meta: { position: 'absolute', left: space.lg, top: HERO_H * 0.34, gap: space.lg },
  metaRow: { gap: 2 },
  metaLabel: { fontFamily: font.bold, fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5 },
  metaValue: { fontFamily: font.extrabold, fontSize: 15, color: colors.white },
  heroImgWrap: { position: 'absolute', right: -10, top: HERO_H * 0.2, bottom: 24, left: '32%', alignItems: 'center', justifyContent: 'center' },
  heroImg: { width: '100%', height: '100%', transform: [{ rotate: '14deg' }] },

  body: { paddingHorizontal: space.lg, paddingTop: space.xl },
  title: { fontFamily: font.display, fontSize: 34, color: colors.text },
  desc: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, lineHeight: 22, marginTop: space.sm },
  sectionLabel: { fontFamily: font.black, fontSize: 12, color: colors.textFaint, letterSpacing: 1.2, marginTop: space.xl },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.hairline, ...shadow.card },
  chipIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipTitle: { fontFamily: font.bold, fontSize: 13, color: colors.text },
  chipSub: { fontFamily: font.semibold, fontSize: 11, color: colors.textMuted, marginTop: 1 },
  chipPrice: { fontFamily: font.extrabold, fontSize: 13 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 34, backgroundColor: colors.surfaceSolid, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: colors.hairline },
  priceLabel: { fontFamily: font.bold, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5 },
  price: { fontFamily: font.extrabold, fontSize: 22, color: colors.text },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow, minWidth: 160 },
  ctaDisabled: { opacity: 0.6 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: 16, paddingHorizontal: 22 },
  ctaText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
});
