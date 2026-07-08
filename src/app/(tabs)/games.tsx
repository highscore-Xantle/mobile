import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSession } from '../../lib/useSession';
import { fetchLiveMatches, viewerRouteFor } from '../../lib/useLiveMatches';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import { RolloverReveal } from '../../components/RolloverReveal';
import { JoinModal } from '../../components/JoinModal';
import { LiveDot } from '../../components/Feed/LiveStrip';
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
export const GAMES = [
  {
    id: 'number-duel',
    title: 'Number Duel',
    tag: 'MIND GAME',
    tagline: 'Pick a secret. Race to guess.',
    gradient: ['#3B9DE7', '#4967E0'] as [string, string],
    emoji: '🔢',
    image: null as number | null,
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
    image: null as number | null,
    available: true,
    route: '/games/pixel-rush' as string | null,
    hasViewer: true,
  },
  {
    id: 'draughts',
    title: 'Draughts',
    tag: 'BOARD',
    tagline: 'Classic checkers, one on one.',
    gradient: ['#6D3F17', '#2D1808'] as [string, string],
    emoji: '⚫',
    image: require('../../../assets/games-icon/drought.png') as number | null,
    available: true,
    route: null as string | null,   // → /setup/draughts (online or vs bot)
    hasViewer: false,
  },
  {
    id: 'spy',
    title: 'Find the Spy',
    tag: 'STRATEGY',
    tagline: 'Who among you is the spy?',
    gradient: gradients.featured as [string, string],
    emoji: '🕵️',
    image: null as number | null,
    available: false,
    route: null as string | null,
    hasViewer: false,
  },
];

// ─── Active Rooms Sheet ───────────────────────────────────────────────────────
function ActiveRoomsSheet({
  visible, gameId, gameTitle, rooms, loading, onClose, onSelectRoom,
}: {
  visible: boolean; gameId: string; gameTitle: string;
  rooms: ActiveRoom[]; loading: boolean;
  onClose: () => void; onSelectRoom: (code: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={sheetStyles.scrim} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.springify().damping(18).stiffness(120)}
        style={[sheetStyles.sheet, { paddingBottom: insets.bottom + space.lg }]}
      >
        <GradientFill colors={['#1E2435', colors.bg]} />
        <View style={sheetStyles.handle} />
        <View style={sheetStyles.sheetHeader}>
          <View style={sheetStyles.liveRow}>
            <LiveDot color={colors.danger} />
            <Text style={sheetStyles.liveLabel}>LIVE</Text>
          </View>
          <Text style={sheetStyles.sheetTitle}>{gameTitle}</Text>
          <Text style={sheetStyles.sheetSub}>Active rooms you can watch</Text>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.blue} style={{ marginTop: space.xl }} />
        ) : rooms.length === 0 ? (
          <View style={sheetStyles.emptyState}>
            <Text style={sheetStyles.emptyEmoji}>🎮</Text>
            <Text style={sheetStyles.emptyTitle}>No live games right now</Text>
            <Text style={sheetStyles.emptySub}>Check back when someone starts a room</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={sheetStyles.roomList} showsVerticalScrollIndicator={false}>
            {rooms.map((room, i) => (
              <Animated.View key={room.code} entering={FadeInDown.springify().damping(14).delay(i * 60)}>
                <Pressable
                  style={({ pressed }) => [sheetStyles.roomCard, pressed && sheetStyles.roomCardPressed]}
                  onPress={() => onSelectRoom(room.code)}
                >
                  <View style={sheetStyles.roomCardLeft}>
                    <View style={sheetStyles.roomLivePill}>
                      <LiveDot color={colors.danger} />
                      <Text style={sheetStyles.roomLiveText}>LIVE</Text>
                    </View>
                    <Text style={sheetStyles.roomPlayers} numberOfLines={1}>{room.playerNames.join(' vs ')}</Text>
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
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderColor: colors.hairline, minHeight: 320, maxHeight: '75%',
    overflow: 'hidden', paddingHorizontal: space.lg,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, alignSelf: 'center', marginTop: space.md, marginBottom: space.sm },
  sheetHeader: { paddingVertical: space.md, gap: 4 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  liveLabel: { fontFamily: font.extrabold, fontSize: 11, color: colors.danger, letterSpacing: 1 },
  sheetTitle: { fontFamily: font.black, fontSize: 22, color: colors.text },
  sheetSub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  roomList: { gap: space.md, paddingBottom: space.md },
  roomCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: space.md, borderWidth: 1, borderColor: colors.hairline, gap: space.md, ...shadow.card,
  },
  roomCardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  roomCardLeft: { flex: 1, gap: 4 },
  roomLivePill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  roomLiveText: { fontFamily: font.extrabold, fontSize: 10, color: colors.danger, letterSpacing: 1 },
  roomPlayers: { fontFamily: font.black, fontSize: 16, color: colors.text },
  roomRound: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted },
  watchChip: {
    backgroundColor: 'rgba(46,126,240,0.12)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(46,126,240,0.25)',
  },
  watchChipText: { fontFamily: font.bold, fontSize: 13, color: colors.blue },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xl, gap: space.sm },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontFamily: font.black, fontSize: 16, color: colors.text },
  emptySub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});

// ─── Games Tab ────────────────────────────────────────────────────────────────
/**
 * Games tab — full game catalogue browser with live room badges.
 * The Hero Card and game list have been migrated from the old home.tsx so that
 * the Home tab can focus entirely on the social Wins Feed.
 */
export default function GamesTab() {
  const router = useRouter();
  const { session } = useSession();
  const [joinVisible, setJoinVisible] = useState(false);
  const [liveRooms, setLiveRooms] = useState<Record<string, ActiveRoom[]>>({});
  const [sheetGame, setSheetGame] = useState<{ id: string; title: string } | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  // ── Fetch active rooms (10-second poll) ─────────────────────────────────────
  // Shared with the Live tab (useLiveMatches) so both surfaces query the same
  // way instead of drifting apart.
  const fetchLiveRooms = useCallback(async () => {
    const matches = await fetchLiveMatches();
    const map: Record<string, ActiveRoom[]> = {};
    matches.forEach((m) => {
      const room: ActiveRoom = { code: m.code, round: m.round, playerNames: m.playerNames };
      if (!map[m.gameKind]) map[m.gameKind] = [];
      map[m.gameKind].push(room);
    });
    setLiveRooms(map);
  }, []);

  useEffect(() => {
    fetchLiveRooms();
    const interval = setInterval(fetchLiveRooms, 10_000);
    return () => clearInterval(interval);
  }, [fetchLiveRooms]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
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

  const handleLiveBadgePress = (game: typeof GAMES[number]) => {
    if (!game.hasViewer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetLoading(true);
    setSheetGame({ id: game.id, title: game.title });
    fetchLiveRooms().finally(() => setSheetLoading(false));
  };

  const handleWatchRoom = (roomCode: string) => {
    const viewerId = viewerRouteFor(sheetGame?.id ?? '');
    setSheetGame(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/game/[id]', params: { id: viewerId, roomCode } });
  };

  const sheetRooms = sheetGame ? (liveRooms[sheetGame.id] ?? []) : [];

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <JoinModal visible={joinVisible} onClose={() => setJoinVisible(false)} />
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
        >
          {/* Header */}
          <View style={styles.topBar}>
            <Text style={themeText.h1}>Games</Text>
            <View style={styles.topBarActions}>
              <Pressable
                style={styles.joinActionBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setJoinVisible(true); }}
                accessibilityLabel="Join a room"
                accessibilityRole="button"
              >
                <Text style={styles.joinActionText}>JOIN ROOM →</Text>
              </Pressable>
              <HeaderAvatar />
            </View>
          </View>

          {/* Hero card */}
          <RolloverReveal delay={100} duration={800} style={styles.heroSection}>
            <View style={styles.heroCard}>
              <GradientFill colors={gradients.featured} />
              <Text style={styles.heroWatermark}>X</Text>
              <View style={styles.heroContent}>
                <Text style={styles.heroTitle}>Game Night{'\n'}Starts Here.</Text>
                <Text style={styles.heroSub}>Pick a game. Gather your crew.{'\n'}Let the chaos begin.</Text>
              </View>
            </View>
          </RolloverReveal>

          {/* Section title */}
          <Text style={[themeText.h2, { marginTop: space.sm }]}>All Games</Text>

          {/* Game cards */}
          <View style={styles.gamesList}>
            {GAMES.map((g, i) => {
              const roomsForGame = liveRooms[g.id] ?? [];
              const isLive = roomsForGame.length > 0;
              return (
                <Animated.View key={g.id} entering={FadeInDown.springify().damping(14).stiffness(90).delay(i * 80)}>
                  <Pressable
                    style={({ pressed }) => [styles.gameCard, pressed && styles.pressedCard]}
                    onPress={() => handleGamePress(g)}
                    disabled={!g.available}
                    accessibilityLabel={`${g.title} — ${g.available ? 'Play' : 'Coming soon'}`}
                    accessibilityRole="button"
                  >
                    <View style={styles.gameBanner}>
                      <GradientFill colors={g.gradient} />
                      <Text style={styles.gameEmoji}>{g.emoji}</Text>
                      {isLive && (
                        <Pressable
                          style={styles.liveBadge}
                          onPress={() => handleLiveBadgePress(g)}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                          accessibilityLabel={`${roomsForGame.length} live ${g.title} games`}
                        >
                          <LiveDot color={colors.white} />
                          <Text style={styles.liveBadgeText}>LIVE · {roomsForGame.length}</Text>
                        </Pressable>
                      )}
                      {!g.available && (
                        <View style={styles.soonOverlay}>
                          <Text style={styles.soonText}>COMING SOON</Text>
                        </View>
                      )}
                    </View>
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
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  joinActionBtn: { backgroundColor: 'rgba(46,126,240,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  joinActionText: { fontFamily: font.bold, fontSize: 12, color: colors.blue, letterSpacing: 0.5 },
  heroSection: { marginTop: space.xs },
  heroCard: { borderRadius: radius.xl, overflow: 'hidden', minHeight: 190, borderWidth: 1, borderColor: colors.hairline, ...shadow.card },
  heroWatermark: { position: 'absolute', right: -20, top: -40, fontFamily: font.display, fontSize: 220, color: colors.white, opacity: 0.07 },
  heroContent: { flex: 1, padding: space.lg, paddingVertical: space.xl, justifyContent: 'flex-end' },
  heroTitle: { fontFamily: font.black, fontSize: 30, color: colors.white, lineHeight: 36, marginBottom: space.sm },
  heroSub: { fontFamily: font.semibold, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 20 },
  gamesList: { gap: space.md },
  gameCard: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, ...shadow.card },
  gameBanner: { height: 120, width: '100%', alignItems: 'center', justifyContent: 'center' },
  gameEmoji: { fontSize: 52 },
  soonOverlay: { ...(StyleSheet.absoluteFill as ViewStyle), backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  soonText: { fontFamily: font.extrabold, fontSize: 13, color: colors.textMuted, letterSpacing: 2 },
  liveBadge: { position: 'absolute', top: space.sm, right: space.sm, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(239,68,68,0.85)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  liveBadgeText: { fontFamily: font.extrabold, fontSize: 11, color: colors.white, letterSpacing: 1 },
  gameInfo: { flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.md },
  gameTag: { fontFamily: font.extrabold, fontSize: 10, color: colors.textFaint, letterSpacing: 1, marginBottom: 2 },
  gameTitle: { fontFamily: font.black, fontSize: 18, color: colors.text },
  gameTagline: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  gameArrowChip: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  gameArrow: { fontFamily: font.bold, fontSize: 16, color: colors.white },
  pressedCard: { transform: [{ scale: 0.98 }], opacity: 0.95 },
});
