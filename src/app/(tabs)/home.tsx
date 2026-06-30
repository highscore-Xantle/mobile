import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  FadeIn,
  SlideInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSession } from '../../lib/useSession';
import { supabase } from '../../lib/supabase';
import { GradientFill } from '../../components/GradientFill';
import { RolloverReveal } from '../../components/RolloverReveal';
import { MenuDrawer } from '../../components/MenuDrawer';
import { JoinModal } from '../../components/JoinModal';
import {
  colors, font, gradients, radius, shadow, space, text as themeText,
} from '../../theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ActiveRoom {
  code: string;
  round: number;
  playerNames: string[];
}

// ─── Game catalogue ───────────────────────────────────────────────────────────
const GAMES = [
  {
    id: 'number-duel',
    title: 'Number Duel',
    tag: 'MIND GAME',
    tagline: 'Pick a secret. Race to guess.',
    gradient: ['#3B9DE7', '#4967E0'] as [string, string],
    emoji: '🔢',
    available: true,
    route: null as string | null,
    hasViewer: true,
  },
  {
    id: 'pixel-rush',
    title: 'Pixel Rush',
    tag: '1v1 ARCADE',
    tagline: 'Fast. Frantic. Pixel-perfect.',
    gradient: gradients.button as [string, string],
    emoji: '🎮',
    available: true,
    route: '/games/pixel-rush' as string | null,
    hasViewer: false,
  },
  {
    id: 'spy',
    title: 'Find the Spy',
    tag: 'STRATEGY',
    tagline: 'Who among you is the spy?',
    gradient: gradients.featured as [string, string],
    emoji: '🕵️',
    available: false,
    route: null as string | null,
    hasViewer: false,
  },
];

// ─── Live dot animation ───────────────────────────────────────────────────────
function LiveDot({ color = colors.success }: { color?: string }) {
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
      <Animated.View style={[liveDotStyles.dot, { backgroundColor: color }, style]} />
    </View>
  );
}
const liveDotStyles = StyleSheet.create({
  wrap: { width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

// ─── Active Rooms Sheet ───────────────────────────────────────────────────────
// Shows a bottom-sheet modal listing all active rooms for a given game.
// Tapping a room navigates to the live viewer for that room.
function ActiveRoomsSheet({
  visible,
  gameId,
  gameTitle,
  rooms,
  loading,
  onClose,
  onSelectRoom,
}: {
  visible: boolean;
  gameId: string;
  gameTitle: string;
  rooms: ActiveRoom[];
  loading: boolean;
  onClose: () => void;
  onSelectRoom: (code: string) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
      <Pressable style={sheetStyles.scrim} onPress={onClose} />

      {/* Sheet */}
      <Animated.View
        entering={SlideInDown.springify().damping(18).stiffness(120)}
        style={[sheetStyles.sheet, { paddingBottom: insets.bottom + space.lg }]}
      >
        <GradientFill colors={['#1E2435', colors.bg]} />

        {/* Handle */}
        <View style={sheetStyles.handle} />

        {/* Header */}
        <View style={sheetStyles.sheetHeader}>
          <View style={sheetStyles.liveRow}>
            <LiveDot color={colors.danger} />
            <Text style={sheetStyles.liveLabel}>LIVE</Text>
          </View>
          <Text style={sheetStyles.sheetTitle}>{gameTitle}</Text>
          <Text style={sheetStyles.sheetSub}>Active rooms you can watch</Text>
        </View>

        {/* Room list */}
        {loading ? (
          <ActivityIndicator color={colors.blue} style={{ marginTop: space.xl }} />
        ) : rooms.length === 0 ? (
          <View style={sheetStyles.emptyState}>
            <Text style={sheetStyles.emptyEmoji}>🎮</Text>
            <Text style={sheetStyles.emptyTitle}>No live games right now</Text>
            <Text style={sheetStyles.emptySub}>Check back when someone starts a room</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={sheetStyles.roomList}
            showsVerticalScrollIndicator={false}
          >
            {rooms.map((room, i) => (
              <Animated.View
                key={room.code}
                entering={FadeInDown.springify().damping(14).delay(i * 60)}
              >
                <Pressable
                  style={({ pressed }) => [sheetStyles.roomCard, pressed && sheetStyles.roomCardPressed]}
                  onPress={() => onSelectRoom(room.code)}
                >
                  <View style={sheetStyles.roomCardLeft}>
                    <View style={sheetStyles.roomLivePill}>
                      <LiveDot color={colors.danger} />
                      <Text style={sheetStyles.roomLiveText}>LIVE</Text>
                    </View>
                    <Text style={sheetStyles.roomPlayers} numberOfLines={1}>
                      {room.playerNames.join(' vs ')}
                    </Text>
                    <Text style={sheetStyles.roomRound}>Round {room.round}</Text>
                  </View>
                  <View style={sheetStyles.watchChip}>
                    <Text style={sheetStyles.watchChipText}>Watch →</Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    minHeight: 320,
    maxHeight: '75%',
    overflow: 'hidden',
    paddingHorizontal: space.lg,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.hairline,
    alignSelf: 'center',
    marginTop: space.md,
    marginBottom: space.sm,
  },
  sheetHeader: { paddingVertical: space.md, gap: 4 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  liveLabel: { fontFamily: font.extrabold, fontSize: 11, color: colors.danger, letterSpacing: 1 },
  sheetTitle: { fontFamily: font.black, fontSize: 22, color: colors.text },
  sheetSub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  roomList: { gap: space.md, paddingBottom: space.md },
  roomCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1, borderColor: colors.hairline,
    gap: space.md,
    ...shadow.card,
  },
  roomCardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  roomCardLeft: { flex: 1, gap: 4 },
  roomLivePill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  roomLiveText: { fontFamily: font.extrabold, fontSize: 10, color: colors.danger, letterSpacing: 1 },
  roomPlayers: { fontFamily: font.black, fontSize: 16, color: colors.text },
  roomRound: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted },
  watchChip: {
    backgroundColor: 'rgba(46,126,240,0.12)',
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(46,126,240,0.25)',
  },
  watchChipText: { fontFamily: font.bold, fontSize: 13, color: colors.blue },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xl, gap: space.sm },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontFamily: font.black, fontSize: 16, color: colors.text },
  emptySub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});

// ─── Home ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  // Map from game_id → list of active rooms with player data
  const [liveRooms, setLiveRooms] = useState<Record<string, ActiveRoom[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Live rooms sheet state
  const [sheetGame, setSheetGame] = useState<{ id: string; title: string } | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  // ── Auth guard
  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [session, loading]);

  // ── Supabase Presence — global live player count
  useEffect(() => {
    if (!session) return;

    const existing = supabase.getChannels().find(c => c.topic === 'realtime:global_presence');
    if (existing) supabase.removeChannel(existing);

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
  // Queries rooms with status='active' + joins room_players for player names + round from state.
  // Only Number Duel rooms go through this path (game_kind check handled in the badge render).
  const fetchLiveRooms = useCallback(async () => {
    const { data } = await supabase
      .from('rooms')
      .select(`
        code,
        game_kind,
        state,
        room_players (
          display_name,
          profiles ( username )
        )
      `)
      .eq('status', 'active');

    if (!data) return;

    const map: Record<string, ActiveRoom[]> = {};
    data.forEach((r: any) => {
      const names: string[] = (r.room_players ?? []).map((p: any) =>
        p.display_name || p.profiles?.username || 'Player'
      );
      const room: ActiveRoom = {
        code: r.code,
        round: r.state?.round ?? 1,
        playerNames: names,
      };
      if (!map[r.game_kind]) map[r.game_kind] = [];
      map[r.game_kind].push(room);
    });

    setLiveRooms(map);
  }, []);

  useEffect(() => {
    fetchLiveRooms();
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
    if (!game.available) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await new Promise(resolve => setTimeout(resolve, 150));

    if (game.route) {
      router.push(game.route as Parameters<typeof router.push>[0]);
    } else {
      router.push(`/setup/${game.id}` as any);
    }
  };

  // Opens the bottom sheet showing all active rooms for this game
  const handleLiveBadgePress = (game: typeof GAMES[number]) => {
    if (!game.hasViewer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetLoading(true);
    setSheetGame({ id: game.id, title: game.title });
    // Trigger a fresh fetch then clear loading
    fetchLiveRooms().finally(() => setSheetLoading(false));
  };

  // Navigate into the viewer for the selected room
  const handleWatchRoom = (roomCode: string) => {
    setSheetGame(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // number-duel-viewer lives at /game/[id] with id=number-duel-viewer
    router.push({
      pathname: '/game/[id]',
      params: { id: 'number-duel-viewer', roomCode },
    });
  };

  const avatarLetter =
    (session?.user?.user_metadata?.username as string)?.[0]?.toUpperCase() ??
    session?.user?.email?.[0]?.toUpperCase() ?? '?';

  if (loading || !session) return null;

  const sheetRooms = sheetGame ? (liveRooms[sheetGame.id] ?? []) : [];

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <MenuDrawer visible={menuOpen} onClose={() => setMenuOpen(false)} />
      <JoinModal visible={joinVisible} onClose={() => setJoinVisible(false)} />

      {/* Active Rooms Sheet */}
      <ActiveRoomsSheet
        visible={!!sheetGame}
        gameId={sheetGame?.id ?? ''}
        gameTitle={sheetGame?.title ?? ''}
        rooms={sheetRooms}
        loading={sheetLoading}
        onClose={() => setSheetGame(null)}
        onSelectRoom={handleWatchRoom}
      />

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
              onPress={() => router.push('/profile')}
            >
              <View style={styles.avatarInner}>
                <Text style={styles.avatarLetter}>{avatarLetter}</Text>
              </View>
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

          {/* ── Games Section ─────────────────────────── */}
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
              const roomsForGame = liveRooms[g.id] ?? [];
              const isLive = roomsForGame.length > 0;
              return (
                <Animated.View
                  key={g.id}
                  entering={FadeInDown.springify().damping(14).stiffness(90).delay(i * 80)}
                >
                  <Pressable
                    style={({ pressed }) => [styles.gameCard, pressed && styles.pressedCard]}
                    onPress={() => handleGamePress(g)}
                    disabled={!g.available}
                  >
                    {/* Gradient banner */}
                    <View style={styles.gameBanner}>
                      <GradientFill colors={g.gradient} />
                      <Text style={styles.gameEmoji}>{g.emoji}</Text>

                      {/* LIVE badge — only shown when a game is actively being played */}
                      {isLive && (
                        <Pressable
                          style={styles.liveBadge}
                          onPress={() => handleLiveBadgePress(g)}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                          <LiveDot color={colors.white} />
                          <Text style={styles.liveBadgeText}>
                            LIVE · {roomsForGame.length}
                          </Text>
                        </Pressable>
                      )}

                      {/* Coming soon overlay */}
                      {!g.available && (
                        <View style={styles.soonOverlay}>
                          <Text style={styles.soonText}>COMING SOON</Text>
                        </View>
                      )}
                    </View>

                    {/* Info row */}
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

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  joinActionBtn: {
    backgroundColor: 'rgba(46,126,240,0.15)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.sm,
  },
  joinActionText: { fontFamily: font.bold, fontSize: 12, color: colors.blue, letterSpacing: 0.5 },

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
    ...(StyleSheet.absoluteFill as ViewStyle),
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
