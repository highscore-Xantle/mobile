import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import PixelBoard from '../../components/PixelBoard';
import {
  DEFAULT_PUZZLE_IMAGE,
  autoAdvanceRound,
  gridForRound,
  leaveGame,
  playerLabel,
  requestRematch,
  seedFor,
  setRoundImage,
  startGame,
  submitSolve,
  useGame,
  type GamePlayer,
} from '../../lib/usePixelGame';
import { useSession } from '../../lib/useSession';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

export default function GameScreen() {
  const { id: code } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user?.id ?? null;

  const { game, players, round, loading, error } = useGame(code);
  const isHost = game?.host_id === myId;

  // Track whether this client has submitted a solve for the current round.
  const [mySolved, setMySolved] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // Reset solved flag when a new round starts.
  useEffect(() => { setMySolved(false); }, [round?.round_no]);

  // Host: automatically set the round image when a new round needs one.
  useEffect(() => {
    if (!game || !round || !isHost) return;
    if (game.status !== 'active') return;
    if (round.status !== 'awaiting_image') return;
    setRoundImage(game.id, round.round_no, DEFAULT_PUZZLE_IMAGE).catch(console.warn);
  }, [game?.id, game?.status, round?.status, round?.round_no, isHost]);

  // Both clients: auto-advance once a round is decided.
  useEffect(() => {
    if (!game || !round) return;
    if (round.status !== 'done') return;
    autoAdvanceRound(game.id, round.round_no).catch(console.warn);
  }, [game?.id, round?.status, round?.round_no]);

  async function handleStart() {
    if (!game || actionBusy) return;
    setActionBusy(true);
    try { await startGame(game.id); } catch (e) {
      Alert.alert('Could not start', (e as Error).message);
    } finally { setActionBusy(false); }
  }

  async function handleSolve(timeMs: number) {
    if (!game || !round || mySolved) return;
    setMySolved(true);
    try {
      await submitSolve(game.id, round.round_no, timeMs);
      await autoAdvanceRound(game.id, round.round_no);
    } catch (e) {
      console.warn('[game] submitSolve error:', e);
    }
  }

  async function handleLeave() {
    if (!game) return;
    Alert.alert(
      'Leave game',
      'Are you sure you want to leave?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            await leaveGame(game.id).catch(console.warn);
            router.replace('/home');
          },
        },
      ],
    );
  }

  async function handleRematch() {
    if (!game || actionBusy) return;
    setActionBusy(true);
    try { await requestRematch(game.id); } catch (e) {
      Alert.alert('Could not rematch', (e as Error).message);
    } finally { setActionBusy(false); }
  }

  async function shareCode() {
    if (!game) return;
    await Share.share({
      message: `Join my Pixel Rush game on Xantle! Code: ${game.invite_code}`,
      title: 'Join Pixel Rush',
    });
  }

  // ── Loading / error shells ──────────────────────────────────

  if (loading) {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={[styles.safe, styles.center]}>
          <ActivityIndicator color={colors.blue} size="large" />
        </SafeAreaView>
      </View>
    );
  }

  if (error || !game) {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={[styles.safe, styles.center]}>
          <Text style={themeText.body}>{error ?? 'Game not found.'}</Text>
          <Pressable style={[styles.outlineBtn, { marginTop: space.lg }]} onPress={() => router.replace('/home')}>
            <Text style={styles.outlineBtnText}>Go home</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ── Lobby ───────────────────────────────────────────────────

  if (game.status === 'lobby') {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={styles.safe}>
          <Header title="Pixel Rush 🧩" onBack={handleLeave} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

            <View style={styles.codeCard}>
              <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
              <Text style={styles.codeLabel}>INVITE CODE</Text>
              <Text style={styles.codeText}>{game.invite_code}</Text>
              <Pressable
                style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
                onPress={shareCode}
              >
                <Text style={styles.shareBtnText}>Share invite</Text>
              </Pressable>
            </View>

            <Text style={[themeText.label, { marginBottom: space.sm }]}>
              PLAYERS ({players.length}/{game.max_players})
            </Text>
            <View style={styles.playerList}>
              {players.map((p) => (
                <PlayerRow key={p.id} player={p} isMe={p.user_id === myId} />
              ))}
              {players.length < game.max_players && (
                <View style={[styles.playerRow, styles.playerRowLast]}>
                  <Text style={styles.waitingText}>Waiting for opponent…</Text>
                </View>
              )}
            </View>

            {isHost && (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  players.length < 2 && styles.primaryBtnDisabled,
                  pressed && players.length >= 2 && styles.pressed,
                ]}
                onPress={handleStart}
                disabled={players.length < 2 || actionBusy}
              >
                <GradientFill colors={players.length >= 2 ? gradients.button : [colors.surface, colors.surface]} />
                {actionBusy
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={[styles.primaryBtnText, players.length < 2 && styles.disabledText]}>
                      {players.length < 2 ? 'Waiting for opponent…' : 'Start game →'}
                    </Text>
                }
              </Pressable>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Active ──────────────────────────────────────────────────

  if (game.status === 'active') {
    const roundNo = game.current_round;
    const grid = gridForRound(roundNo);
    const seed = seedFor(game.id, roundNo);
    const startedAt = round?.started_at ? new Date(round.started_at).getTime() : Date.now();
    const imageUrl = round?.image_url ?? DEFAULT_PUZZLE_IMAGE;
    const isRacing = round?.status === 'racing';
    const winnerPlayer = round?.winner_player
      ? players.find(p => p.user_id === round.winner_player)
      : null;

    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={styles.safe}>
          <Header
            title={`Round ${roundNo}/${game.rounds_total}`}
            subtitle={`Grid ${grid}×${grid}`}
            onBack={handleLeave}
          />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

            {/* Scores */}
            <View style={styles.scoreRow}>
              {players.map((p) => (
                <View key={p.id} style={[styles.scoreChip, p.user_id === myId && styles.scoreChipMe]}>
                  <Text style={styles.scoreName} numberOfLines={1}>
                    {p.user_id === myId ? 'You' : playerLabel(p)}
                  </Text>
                  <Text style={styles.scoreValue}>{p.score}</Text>
                </View>
              ))}
            </View>

            {/* Board or setup indicator */}
            {(!round || round.status === 'awaiting_image') ? (
              <View style={styles.setupRow}>
                <ActivityIndicator color={colors.blue} />
                <Text style={styles.setupText}>Setting up round…</Text>
              </View>
            ) : (
              <PixelBoard
                image={imageUrl}
                seed={seed}
                grid={grid}
                startedAt={startedAt}
                locked={mySolved || !isRacing}
                onSolve={handleSolve}
              />
            )}

            {/* Round result banner */}
            {round?.status === 'done' && (
              <View style={styles.roundResultCard}>
                <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
                <Text style={styles.roundResultText}>
                  {winnerPlayer
                    ? `${winnerPlayer.user_id === myId ? 'You' : playerLabel(winnerPlayer)} won the round! 🎉`
                    : 'Round complete!'}
                </Text>
                <ActivityIndicator color={colors.blue} size="small" style={{ marginTop: 4 }} />
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Finished ────────────────────────────────────────────────

  const overallWinner = game.winner_player
    ? players.find(p => p.user_id === game.winner_player)
    : null;
  const iWon = overallWinner?.user_id === myId;

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <Header title="Game over" onBack={() => router.replace('/home')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          <View style={styles.finishedCard}>
            <GradientFill colors={iWon ? gradients.button : [colors.surface, colors.surfaceAlt]} />
            <Text style={styles.finishedEmoji}>{iWon ? '🏆' : '🥈'}</Text>
            <Text style={styles.finishedTitle}>
              {overallWinner
                ? `${iWon ? 'You won!' : `${playerLabel(overallWinner)} wins!`}`
                : 'Match complete!'}
            </Text>
          </View>

          <Text style={[themeText.label, { marginBottom: space.sm }]}>FINAL SCORES</Text>
          <View style={styles.playerList}>
            {[...players]
              .sort((a, b) => b.score - a.score)
              .map((p, i) => (
                <PlayerRow key={p.id} player={p} isMe={p.user_id === myId} showScore rank={i + 1} />
              ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            onPress={handleRematch}
            disabled={actionBusy}
          >
            <GradientFill colors={gradients.button} />
            {actionBusy
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.primaryBtnText}>Rematch</Text>
            }
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.outlineBtn, { marginTop: space.sm }, pressed && styles.pressed]}
            onPress={() => router.replace('/home')}
          >
            <Text style={styles.outlineBtnText}>Back to home</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function Header({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.topBar}>
      <Pressable
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        onPress={onBack}
      >
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <Text style={themeText.h2}>{title}</Text>
        {subtitle ? <Text style={themeText.hint}>{subtitle}</Text> : null}
      </View>
      <HeaderAvatar />
    </View>
  );
}

function PlayerRow({
  player,
  isMe,
  showScore,
  rank,
}: {
  player: GamePlayer;
  isMe: boolean;
  showScore?: boolean;
  rank?: number;
}) {
  const isLast = rank === undefined;
  return (
    <View style={[styles.playerRow, isLast && styles.playerRowLast]}>
      <View style={[styles.playerAvatar, isMe && styles.playerAvatarMe]}>
        <Text style={styles.playerAvatarLetter}>
          {playerLabel(player).charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.playerName}>
          {isMe ? `${playerLabel(player)} (you)` : playerLabel(player)}
        </Text>
        {player.is_host && <Text style={styles.playerBadge}>HOST</Text>}
      </View>
      {showScore && (
        <Text style={styles.playerScore}>{player.score} pts</Text>
      )}
      {rank !== undefined && (
        <Text style={styles.playerRank}>{rank === 1 ? '🏆' : `#${rank}`}</Text>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: space.xl, gap: space.lg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backGlyph: { color: colors.text, fontSize: 22, marginTop: -2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },

  // ── Lobby ──
  codeCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    alignItems: 'center',
    gap: space.sm,
    ...shadow.card,
  },
  codeLabel: { fontFamily: font.bold, fontSize: 12, color: colors.textFaint, letterSpacing: 1 },
  codeText: {
    fontFamily: font.black,
    fontSize: 36,
    color: colors.blue,
    letterSpacing: 6,
  },
  shareBtn: {
    marginTop: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  shareBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.text },

  playerList: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: space.sm,
  },
  playerRowLast: { borderBottomWidth: 0 },
  playerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarMe: { backgroundColor: colors.blue },
  playerAvatarLetter: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  playerName: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  playerBadge: { fontFamily: font.extrabold, fontSize: 10, color: colors.textFaint, letterSpacing: 0.5 },
  playerScore: { fontFamily: font.extrabold, fontSize: 16, color: colors.text },
  playerRank: { fontFamily: font.extrabold, fontSize: 18, color: colors.text, width: 36, textAlign: 'center' },
  waitingText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, flex: 1 },

  primaryBtn: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    paddingVertical: space.md,
    alignItems: 'center',
    ...shadow.blueGlow,
  },
  primaryBtnDisabled: { opacity: 0.5, shadowOpacity: 0, elevation: 0 },
  primaryBtnText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  disabledText: { color: colors.textMuted },

  outlineBtn: {
    borderRadius: radius.lg,
    paddingVertical: space.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  outlineBtnText: { fontFamily: font.bold, fontSize: 15, color: colors.textMuted },

  // ── Active ──
  scoreRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  scoreChip: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space.md,
    alignItems: 'center',
    gap: 2,
    ...shadow.card,
  },
  scoreChipMe: { borderWidth: 1.5, borderColor: colors.blue },
  scoreName: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted },
  scoreValue: { fontFamily: font.black, fontSize: 28, color: colors.text },

  setupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
  },
  setupText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted },

  roundResultCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    alignItems: 'center',
    gap: space.xs,
    ...shadow.card,
  },
  roundResultText: { fontFamily: font.extrabold, fontSize: 16, color: colors.text, textAlign: 'center' },

  // ── Finished ──
  finishedCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    paddingVertical: space.xl,
    alignItems: 'center',
    gap: space.sm,
    ...shadow.blueGlow,
  },
  finishedEmoji: { fontSize: 64 },
  finishedTitle: { fontFamily: font.black, fontSize: 28, color: colors.white },
});
