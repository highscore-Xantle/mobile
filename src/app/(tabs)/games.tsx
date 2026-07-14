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
import { supabase } from '../../lib/supabase';
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
    gradient: ['#8B5A2B', '#3B2A1D'] as [string, string],
    cardBg: ['#3B2A1D', '#150E08'] as string[],           // warm bronze-black, matches the keypad's board background
    theme: ['#8B5A2B', '#3B2A1D'] as [string, string],    // warm copper-bronze — this is the hero/background gradient, has to actually match the image's own dark warm tone, not just a pop color
    accent: '#D98F3B',                                     // warm amber-copper, sampled from the keypad's lit "5" key — same warm family as theme, matches Draughts' accent/theme pairing
    emoji: '🔢',
    image: require('../../../assets/games-icon/number-duel.png') as number | null,
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
    cardBg: ['#123542', '#0A1E26'] as string[],           // dark teal-navy, arcade energy
    theme: ['#22D3EE', '#0891B2'] as [string, string],    // electric cyan -> teal right-band
    accent: '#22D3EE',
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
    cardBg: ['#5A3A1E', '#3A2413', '#160E07'] as string[],   // warm wood tones from the board image
    theme: ['#D08A24', '#6D3F17'] as [string, string],       // amber/gold → wood-brown
    accent: '#C8811F',
    emoji: '⚫',
    image: require('../../../assets/games-icon/drought.png') as number | null,
    available: true,
    route: null as string | null,   // no dedicated screen — details handles every mode
    hasViewer: false,
  },
  {
    id: 'spy',
    title: 'Find the Spy',
    tag: 'STRATEGY',
    tagline: 'Who among you is the spy?',
    gradient: gradients.featured as [string, string],
    cardBg: ['#2E2140', '#1A1225'] as string[],           // dark plum, mystery/noir tone
    theme: ['#A78BFA', '#6D28D9'] as [string, string],    // violet right-band gradient
    accent: '#8B5CF6',
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
  const fetchLiveRooms = useCallback(async () => {
    const [{ data: rooms }, { data: games }] = await Promise.all([
      supabase
        .from('rooms')
        .select(`code, game_kind, state, room_players ( display_name, profiles ( username ) )`)
        .eq('status', 'active'),
      supabase
        .from('games')
        .select(`invite_code, current_round, game_players ( guest_name, profile:user_id ( username ) )`)
        .eq('status', 'active')
        .eq('game_type', 'pixel_rush'),
    ]);
    const map: Record<string, ActiveRoom[]> = {};
    (rooms ?? []).forEach((r: any) => {
      const names: string[] = (r.room_players ?? []).map((p: any) =>
        p.display_name || p.profiles?.username || 'Player'
      );
      const room: ActiveRoom = { code: r.code, round: r.state?.round ?? 1, playerNames: names };
      if (!map[r.game_kind]) map[r.game_kind] = [];
      map[r.game_kind].push(room);
    });
    (games ?? []).forEach((g: any) => {
      const names: string[] = (g.game_players ?? []).map((p: any) =>
        p.guest_name || p.profile?.username || 'Player'
      );
      const room: ActiveRoom = { code: g.invite_code, round: g.current_round ?? 1, playerNames: names };
      if (!map['pixel-rush']) map['pixel-rush'] = [];
      map['pixel-rush'].push(room);
    });
    setLiveRooms(map);
  }, []);

  useEffect(() => {
    fetchLiveRooms();
    const interval = setInterval(fetchLiveRooms, 10_000);
    return () => clearInterval(interval);
  }, [fetchLiveRooms]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  // Every game opens the same product-detail screen (the Draughts pattern):
  // hero + description + the 4 selectable play modes. Same flow as the Home tab.
  // The 150ms haptic pause made this an easy double-tap target: two taps in
  // the window pushed /details twice, seeding duplicate stack entries that
  // broke back-navigation further in. Lock re-entry for a beat.
  const gamePressLockRef = useRef(0);
  const handleGamePress = async (game: typeof GAMES[number]) => {
    if (!game.available) return;
    const now = Date.now();
    if (now - gamePressLockRef.current < 1000) return;
    gamePressLockRef.current = now;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await new Promise(resolve => setTimeout(resolve, 150));
    router.push(`/details/${game.id}` as any);
  };

  const handleLiveBadgePress = (game: typeof GAMES[number]) => {
    if (!game.hasViewer) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetLoading(true);
    setSheetGame({ id: game.id, title: game.title });
    fetchLiveRooms().finally(() => setSheetLoading(false));
  };

  const handleWatchRoom = (roomCode: string) => {
    const viewerId = sheetGame?.id === 'pixel-rush' ? 'pixel-rush-viewer' : 'number-duel-viewer';
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
