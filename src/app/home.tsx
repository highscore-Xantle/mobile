import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSession } from '../lib/useSession';
import { supabase } from '../lib/supabase';
import { GradientFill } from '../components/GradientFill';
import { RolloverReveal } from '../components/RolloverReveal';
import { MenuDrawer } from '../components/MenuDrawer';
import { JoinModal } from '../components/JoinModal';
import {
  colors, font, gradients, radius, shadow, space, text as themeText,
} from '../theme';

// ─── Game catalogue ─────────────────────────────────────────────────────────
const GAMES = [
  {
    id: 'number-duel',
    title: 'Number Duel',
    tag: 'MIND GAME',
    tagline: 'Pick a secret. Race to guess.',
    gradient: ['#3B9DE7', '#4967E0'] as [string, string],
    emoji: '🔢',
    available: true,
  },
  {
    id: 'droughts',
    title: 'Droughts',
    tag: 'STRATEGY',
    tagline: 'Classic board game, digital.',
    gradient: ['#6BC9F5', '#3B9DE7'] as [string, string],
    emoji: '♟️',
    available: false, // Victor's task
  },
  {
    id: 'rush-pixel',
    title: 'Rush Pixel',
    tag: 'ARCADE',
    tagline: 'Fast. Frantic. Pixel-perfect.',
    gradient: ['#FBBF24', '#F87171'] as [string, string],
    emoji: '🎮',
    available: false, // Victor's task
  },
];

// ─── Live dot animation ─────────────────────────────────────────────────────
function LiveDot() {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.5, { duration: 600 }),
        withTiming(1, { duration: 600 })
      ),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <View style={liveDotStyles.wrap}>
      <Animated.View style={[liveDotStyles.dot, style]} />
    </View>
  );
}
const liveDotStyles = StyleSheet.create({
  wrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
});

// ─── Home ──────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [liveRooms, setLiveRooms] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Auth guard
  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [session, loading]);

  // ── Supabase Presence — global live player count
  useEffect(() => {
    if (!session) return;

    // Remove any lingering channel from previous renders to avoid the "cannot add presence callbacks after subscribe()" error
    const existing = supabase.getChannels().find(c => c.topic === 'realtime:global_presence');
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase.channel('global_presence', {
      config: { presence: { key: session.user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setLiveCount(Object.keys(state).length);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: session.user.id, online_at: Date.now() });
        }
      });

    presenceChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [session]);

  // ── Fetch active rooms for LIVE badges
  const fetchLiveRooms = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select('game_kind')
      .eq('status', 'active');
    if (data) {
      const map: Record<string, boolean> = {};
      data.forEach((r: any) => { map[r.game_kind] = true; });
      setLiveRooms(map);
    }
  }, []);

  useEffect(() => {
    fetchLiveRooms();
    // Poll every 10 seconds for active rooms
    const interval = setInterval(fetchLiveRooms, 10_000);
    return () => clearInterval(interval);
  }, [fetchLiveRooms]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchLiveRooms();
    setRefreshing(false);
  }, [fetchLiveRooms]);

  // ── Handlers
  const handleMenuPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuOpen(true);
  };

  const handleGamePress = async (game: typeof GAMES[number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!game.available) {
      // Coming soon — just show a stub
      router.push(`/game/${game.id}`);
      return;
    }
    const { data: room, error } = await supabase.rpc('create_room', {
      p_game_kind: game.id,
      p_is_group: false,
      p_max: 2,
    });
    if (error) { alert('Error creating room: ' + error.message); return; }
    router.push(`/room/${room.code}`);
  };

  const handleWatchLive = (gameId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/game/[id]', params: { id: `${gameId}-viewer` } });
  };

  const avatarLetter =
    (session?.user?.user_metadata?.username as string)?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ?? '?';

  if (loading || !session) return null;

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <MenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
      <JoinModal visible={joinVisible} onClose={() => setJoinVisible(false)} />

      <SafeAreaView style={styles.safe}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.blue}
            />
          }
        >
          {/* ── Top Bar ──────────────────────────────── */}
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <View style={styles.avatarInner}>
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              </View>
              {/* Online dot */}
              <View style={styles.onlineDot} />
            </Pressable>

            <View style={styles.wordmarkRow}>
              <Text style={[styles.wordmark, { color: colors.blue }]}>X</Text>
              <Text style={styles.wordmark}>antle</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
              onPress={handleMenuPress}
            >
              <View style={styles.menuBar} />
              <View style={[styles.menuBar, { width: 18 }]} />
              <View style={[styles.menuBar, { width: 14 }]} />
            </Pressable>
          </View>

          {/* ── Live Players Banner ───────────────────── */}
          <Animated.View entering={FadeInDown.springify().damping(14)} style={styles.liveBanner}>
            <LiveDot />
            <Text style={styles.liveBannerText}>
              <Text style={styles.liveBannerCount}>{liveCount} </Text>
              player{liveCount !== 1 ? 's' : ''} online right now
            </Text>
          </Animated.View>

          {/* ── Hero Card ────────────────────────────── */}
          <RolloverReveal delay={100} duration={800} style={styles.heroSection}>
            <View style={styles.heroCard}>
              <GradientFill colors={gradients.featured} />
              <Text style={styles.heroWatermark}>X</Text>
              <View style={styles.heroContent}>
                <Text style={styles.heroTitle}>Game Night{'\n'}Starts Here.</Text>
                <Text style={styles.heroSub}>
                  Pick a game. Gather your crew.{'\n'}Let the chaos begin.
                </Text>
              </View>
            </View>
          </RolloverReveal>

          {/* ── Games Section ────────────────────────── */}
          <View style={styles.sectionHeader}>
            <Text style={themeText.h2}>Games</Text>
            <Pressable
              style={styles.joinActionBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setJoinVisible(true); }}
            >
              <Text style={styles.joinActionText}>JOIN ROOM →</Text>
            </Pressable>
          </View>

          <View style={styles.gamesList}>
            {GAMES.map((g, i) => {
              const isLive = liveRooms[g.id];
              return (
                <Animated.View
                  key={g.id}
                  entering={FadeInDown.springify().damping(14).stiffness(90).delay(i * 80)}
                >
                  <Pressable
                    style={({ pressed }) => [styles.gameCard, pressed && styles.pressedCard]}
                    onPress={() => handleGamePress(g)}
                  >
                    {/* Gradient banner */}
                    <View style={styles.gameBanner}>
                      <GradientFill colors={g.gradient} />
                      <Text style={styles.gameEmoji}>{g.emoji}</Text>
                      {/* LIVE badge */}
                      {isLive && (
                        <Pressable
                          style={styles.liveBadge}
                          onPress={() => handleWatchLive(g.id)}
                        >
                          <LiveDot />
                          <Text style={styles.liveBadgeText}>LIVE</Text>
                        </Pressable>
                      )}
                      {/* Coming soon overlay */}
                      {!g.available && (
                        <View style={styles.soonOverlay}>
                          <Text style={styles.soonText}>COMING SOON</Text>
                        </View>
                      )}
                    </View>

                    {/* Info */}
                    <View style={styles.gameInfo}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.gameTag}>{g.tag}</Text>
                        <Text style={styles.gameTitle}>{g.title}</Text>
                        <Text style={styles.gameTagline}>{g.tagline}</Text>
                      </View>
                      <View style={[styles.gameArrowChip, g.available && { backgroundColor: colors.blue }]}>
                        <Text style={styles.gameArrow}>→</Text>
                      </View>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  scrollContent: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: space.sm,
  },
  avatarWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: colors.blue, ...shadow.blueGlow,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInner: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { fontFamily: font.extrabold, fontSize: 17, color: colors.blue },
  onlineDot: {
    position: 'absolute', bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2, borderColor: colors.bg,
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center' },
  wordmark: { fontFamily: font.display, fontSize: 24, color: colors.text, letterSpacing: -0.5 },
  menuBtn: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    gap: 5, borderWidth: 1, borderColor: colors.hairline, ...shadow.card,
  },
  menuBar: { width: 22, height: 2.5, borderRadius: 2, backgroundColor: colors.text },

  // Live banner
  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md, paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.hairline,
    alignSelf: 'flex-start',
  },
  liveBannerText: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  liveBannerCount: { fontFamily: font.extrabold, color: colors.text },

  // Hero
  heroSection: { marginTop: space.sm },
  heroCard: {
    borderRadius: radius.xl, overflow: 'hidden', minHeight: 190,
    borderWidth: 1, borderColor: colors.hairline, ...shadow.card,
  },
  heroWatermark: {
    position: 'absolute', right: -20, top: -40,
    fontFamily: font.display, fontSize: 220, color: colors.white, opacity: 0.07,
  },
  heroContent: {
    flex: 1, padding: space.lg, paddingVertical: space.xl, justifyContent: 'flex-end',
  },
  heroTitle: { fontFamily: font.black, fontSize: 30, color: colors.white, lineHeight: 36, marginBottom: space.sm },
  heroSub: { fontFamily: font.semibold, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 20 },

  // Section header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  joinActionBtn: {
    backgroundColor: 'rgba(46,126,240,0.15)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.sm,
  },
  joinActionText: { fontFamily: font.bold, fontSize: 12, color: colors.blue, letterSpacing: 0.5 },

  // Games list
  gamesList: { gap: space.md },
  gameCard: {
    borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.hairline,
    ...shadow.card,
  },
  gameBanner: { height: 120, width: '100%', alignItems: 'center', justifyContent: 'center' },
  gameEmoji: { fontSize: 52 },
  soonOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  soonText: { fontFamily: font.extrabold, fontSize: 13, color: colors.textMuted, letterSpacing: 2 },
  liveBadge: {
    position: 'absolute', top: space.sm, right: space.sm,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(239,68,68,0.85)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
  },
  liveBadgeText: { fontFamily: font.extrabold, fontSize: 11, color: colors.white, letterSpacing: 1 },
  gameInfo: {
    flexDirection: 'row', alignItems: 'center',
    padding: space.md, gap: space.md,
  },
  gameTag: { fontFamily: font.extrabold, fontSize: 10, color: colors.textFaint, letterSpacing: 1, marginBottom: 2 },
  gameTitle: { fontFamily: font.black, fontSize: 18, color: colors.text },
  gameTagline: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  gameArrowChip: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  gameArrow: { fontFamily: font.bold, fontSize: 16, color: colors.white },

  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  pressedCard: { transform: [{ scale: 0.98 }], opacity: 0.95 },
});
