// Game detail screen (product-page layout). Themed hero + title + description.
// For Draughts the feature grid becomes 4 SELECTABLE play modes that drive the
// bottom CTA (label + price). Other games keep a static feature grid.
//
// Mode wiring (stage 1):
//   online → create a room and wait in the lobby (10s matchmaking + smart-bot
//            fallback is a stage-2 enhancement of the lobby)
//   invite → create a room; share the code from the lobby (full invite modal
//            with username search / friends list / QR is stage 2)
//   group  → $2 premium (payment is stage 2)
//   join   → CTA becomes "Join now" → enter-code modal → join_room
import { useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Modal, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn, SlideInDown } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { GradientFill } from '../../components/GradientFill';
import { GAMES } from '../(tabs)/games';
import { colors, font, radius, shadow, space } from '../../theme';

type FAIcon = React.ComponentProps<typeof FontAwesome>['name'];

const SCREEN_H = Dimensions.get('window').height;
const HERO_H = Math.round(SCREEN_H * 0.46);

const META: { label: string; value: string }[] = [
  { label: 'TYPE', value: 'Board' },
  { label: 'STYLE', value: 'Strategy' },
  { label: 'PACE', value: 'Turn-based' },
];

type Mode = 'online' | 'invite' | 'group' | 'join';
const MODES: { key: Mode; icon: FAIcon; title: string; sub: string; cta: string; price: string }[] = [
  { key: 'online', icon: 'globe',     title: 'Play Online',    sub: 'Match with anyone',    cta: 'Play',     price: 'Free' },
  { key: 'invite', icon: 'user-plus', title: 'Invite a Friend', sub: 'Play someone you know', cta: 'Invite',  price: 'Free' },
  { key: 'group',  icon: 'users',     title: 'Group',          sub: 'Up to 8 players',      cta: 'Create',   price: '$2' },
  { key: 'join',   icon: 'sign-in',   title: 'Join a Game',    sub: 'Enter an invite code', cta: 'Join now', price: 'Free' },
];

// Static features for non-Draughts games.
const FEATURES: { icon: FAIcon; title: string; sub: string }[] = [
  { icon: 'bolt', title: 'Fast Rounds', sub: 'Quick to play' },
  { icon: 'star', title: 'Rankings', sub: 'Climb the board' },
  { icon: 'users', title: 'Multiplayer', sub: 'Play friends' },
  { icon: 'android', title: 'Practice', sub: 'Solo vs bot' },
];

export default function GameDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const game = GAMES.find((g) => g.id === id);

  const isDraughts = id === 'draughts';
  const [mode, setMode] = useState<Mode>('online');
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!game) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.text }}>Game not found.</Text>
      </View>
    );
  }

  const selected = MODES.find((m) => m.key === mode)!;

  const playSimple = () => {
    if (!game.available) return;
    if (game.route) router.push(game.route as Parameters<typeof router.push>[0]);
    else router.push(`/setup/${game.id}` as any);
  };

  const createRoom = async () => {
    setBusy(true); setErr('');
    const { data: room, error } = await supabase.rpc('create_room', {
      p_game_kind: 'draughts', p_state: {}, p_is_group: false, p_max: 2,
    });
    setBusy(false);
    if (error || !room) { Alert.alert('Could not start', error?.message ?? 'Please try again.'); return; }
    router.push(`/room/${room.code}` as any);
  };

  const handleCta = () => {
    if (busy) return;
    if (mode === 'online') { router.push('/game/draughts?mp=online' as any); return; }  // matchmaking
    if (mode === 'invite') { createRoom(); return; }                                    // → lobby to share the code
    if (mode === 'group') { Alert.alert('Group play', 'Group games ($2) are coming soon.'); return; }
    if (mode === 'join') { setErr(''); setCode(''); setJoinOpen(true); return; }
  };

  const doJoin = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 4) { setErr('Enter a valid invite code.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('join_room', { p_code: c });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setJoinOpen(false);
    router.push(`/room/${c}` as any);
  };

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
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
            {META.map((m) => (
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

          {isDraughts && <Text style={styles.sectionLabel}>HOW DO YOU WANT TO PLAY?</Text>}

          <View style={styles.grid}>
            {isDraughts
              ? MODES.map((m, i) => {
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

      {/* Bottom bar — reflects the selected mode (Draughts) */}
      <View style={styles.bottomBar}>
        <View>
          <Text style={styles.priceLabel}>{isDraughts ? selected.title.toUpperCase() : 'PRICE'}</Text>
          <Text style={styles.price}>{isDraughts ? selected.price : 'Free'}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.cta, !game.available && styles.ctaDisabled, pressed && styles.pressed]}
          onPress={isDraughts ? handleCta : playSimple}
          disabled={!game.available || busy}
        >
          <View style={styles.ctaInner}>
            <GradientFill colors={game.theme} />
            {busy ? <ActivityIndicator color={colors.white} /> : (
              <>
                <Text style={styles.ctaText}>{game.available ? (isDraughts ? selected.cta : 'Play') : 'Coming soon'}</Text>
                {game.available && <FontAwesome name="arrow-right" size={14} color={colors.white} />}
              </>
            )}
          </View>
        </Pressable>
      </View>

      {/* Join-by-code modal */}
      <Modal visible={joinOpen} transparent animationType="fade" onRequestClose={() => setJoinOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setJoinOpen(false)} />
        <Animated.View entering={SlideInDown.springify().damping(18)} style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Join a game</Text>
          <Text style={styles.sheetSub}>Enter the invite code your friend shared.</Text>
          <View style={styles.codeInputWrap}>
            <TextInput
              style={styles.codeInput}
              placeholder="CODE"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              value={code}
              onChangeText={(t) => { setCode(t); setErr(''); }}
            />
          </View>
          {err ? <Text style={styles.errText}>{err}</Text> : null}
          <Pressable style={({ pressed }) => [styles.cta, pressed && styles.pressed]} onPress={doJoin} disabled={busy}>
            <View style={styles.ctaInner}>
              <GradientFill colors={game.theme} />
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.ctaText}>Join now</Text>}
            </View>
          </Pressable>
        </Animated.View>
      </Modal>
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

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 34, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTopWidth: 1, borderColor: colors.hairline },
  priceLabel: { fontFamily: font.bold, fontSize: 10, color: colors.textFaint, letterSpacing: 1.5 },
  price: { fontFamily: font.extrabold, fontSize: 22, color: colors.text },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow, minWidth: 160 },
  ctaDisabled: { opacity: 0.6 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: 16, paddingHorizontal: 22 },
  ctaText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },

  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: space.lg, paddingBottom: 40, gap: space.sm },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: space.sm },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 20, color: colors.text },
  sheetSub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, marginBottom: space.sm },
  codeInputWrap: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.hairline },
  codeInput: { fontFamily: font.extrabold, fontSize: 22, color: colors.text, textAlign: 'center', letterSpacing: 6, paddingVertical: 16 },
  errText: { fontFamily: font.semibold, fontSize: 13, color: colors.danger, textAlign: 'center' },
});
