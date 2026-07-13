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
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import QRCode from 'react-native-qrcode-svg';
import Animated, { BounceIn } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../../components/ui/Avatar';
import { Confetti } from '../../components/Confetti';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import PixelBoard from '../../components/PixelBoard';
import { computeBotSolveDelayMs, getRecentWinRate } from '../../lib/botOpponent';
import { playSound } from '../../lib/sounds';
import {
  DEFAULT_PUZZLE_IMAGE,
  autoAdvanceRound,
  gridForRound,
  joinGame,
  leaveGame,
  pickPuzzleImage,
  playerLabel,
  requestRematch,
  seedFor,
  setRoundImage,
  startGame,
  submitBotSolve,
  submitSolve,
  useGame,
  type GamePlayer,
} from '../../lib/usePixelGame';
import { usePresence } from '../../lib/usePresence';
import { useSession } from '../../lib/useSession';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

export default function GameScreen() {
  const { id: code } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const myId = session?.user?.id ?? null;

  const { game, players, round, loading, error } = useGame(code);
  const { isOnline } = usePresence();
  const isHost = game?.host_id === myId;
  const botPlayer = players.find((p) => p.is_bot) ?? null;
  const overallWinner = game?.winner_is_bot
    ? botPlayer
    : game?.winner_player
      ? players.find(p => p.user_id === game.winner_player)
      : null;
  const iWon = !!overallWinner && overallWinner.user_id === myId;

  // Track whether this client has submitted a solve for the current round.
  const [mySolved, setMySolved] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [winRate, setWinRate] = useState(0);
  const [shareState, setShareState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [copied, setCopied] = useState(false);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only the host calls setRoundImage — if the host's app closes right when a
  // new round needs one, everyone else was stuck on "Setting up round…"
  // forever with no indication why. A short grace period avoids flagging a
  // brief background/foreground blip as a real disconnect.
  const [hostOffline, setHostOffline] = useState(false);
  useEffect(() => {
    if (isHost || !game?.host_id) { setHostOffline(false); return; }
    if (isOnline(game.host_id)) { setHostOffline(false); return; }
    const t = setTimeout(() => setHostOffline(true), 10000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, game?.host_id, isOnline(game?.host_id)]);

  // Reset solved flag when a new round starts.
  useEffect(() => { setMySolved(false); }, [round?.round_no]);

  // Match-over win sound — fires once when the finished screen is reached as the winner.
  useEffect(() => {
    if (game?.status === 'finished' && iWon) playSound('win');
  }, [game?.status, iWon]);

  // Auto-join: landing here via a QR scan / deep link seats the scanner as a
  // player instead of leaving them as a bystander.
  useEffect(() => {
    if (!game || !code || !myId) return;
    if (game.status !== 'lobby') return;
    if (players.some((p) => p.user_id === myId)) return;
    if (players.length >= game.max_players) return;
    joinGame(code).catch(console.warn);
  }, [game?.id, game?.status, game?.max_players, code, myId, players]);

  // Host: automatically set the round image when a new round needs one.
  useEffect(() => {
    if (!game || !round || !isHost) return;
    if (game.status !== 'active') return;
    if (round.status !== 'awaiting_image') return;
    setRoundImage(game.id, round.round_no, pickPuzzleImage(game.id, round.round_no)).catch(console.warn);
  }, [game?.id, game?.status, round?.status, round?.round_no, isHost]);

  // Both clients: auto-advance once a round is decided.
  useEffect(() => {
    if (!game || !round) return;
    if (round.status !== 'done') return;
    autoAdvanceRound(game.id, round.round_no).catch(console.warn);
  }, [game?.id, round?.status, round?.round_no]);

  // Bot matches: look up the human's win rate once, to scale the bot's pace.
  useEffect(() => {
    if (!botPlayer || !myId) return;
    getRecentWinRate(myId).then(setWinRate).catch(() => setWinRate(0));
  }, [botPlayer?.id, myId]);

  // Bot matches: schedule the bot's "solve" for the current round at a
  // deterministic, skill-scaled delay. A late submit after the human already
  // won is a harmless no-op (same atomic guard as a human's submit_solve).
  useEffect(() => {
    if (botTimerRef.current) { clearTimeout(botTimerRef.current); botTimerRef.current = null; }
    if (!game || !round || !botPlayer) return;
    if (round.status !== 'racing') return;
    const grid = gridForRound(game.current_round);
    const delay = computeBotSolveDelayMs(game.id, round.round_no, grid, winRate);
    botTimerRef.current = setTimeout(() => {
      submitBotSolve(game.id, round.round_no, delay).catch(console.warn);
    }, delay);
    return () => { if (botTimerRef.current) clearTimeout(botTimerRef.current); };
  }, [game?.id, game?.current_round, round?.status, round?.round_no, botPlayer?.id, winRate]);

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
    const link = Linking.createURL(`/game/${game.invite_code}`);
    await Share.share({
      message: `Join my Pixel Rush game on Xantle! Code: ${game.invite_code}\n${link}`,
      title: 'Join Pixel Rush',
    });
  }

  async function handleCopy() {
    if (!game) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await Clipboard.setStringAsync(game.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShareToHome() {
    if (!game || shareState !== 'idle') return;
    setShareState('busy');
    try {
      const me = players.find((p) => p.user_id === myId);
      const opponent = players.find((p) => p.user_id !== myId);
      const oppLabel = opponent ? (opponent.is_bot ? 'the machine' : `@${playerLabel(opponent)}`) : 'an opponent';
      const resultText = iWon
        ? `Won ${me?.score ?? 0}–${opponent?.score ?? 0} vs ${oppLabel} in Pixel Rush`
        : `Played Pixel Rush vs ${oppLabel} (${me?.score ?? 0}–${opponent?.score ?? 0})`;
      const { error: shareError } = await supabase.rpc('share_win', {
        p_game_type: 'pixel_rush',
        p_result_text: resultText,
        p_match_id: game.id,
      });
      if (shareError) throw shareError;
      setShareState('done');
    } catch (e) {
      setShareState('idle');
      Alert.alert('Could not share', (e as Error).message);
    }
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
              <View style={styles.qrWrap}>
                <QRCode
                  value={Linking.createURL(`/game/${game.invite_code}`)}
                  size={140}
                  backgroundColor={colors.white}
                  color={colors.bg}
                />
              </View>
              <Text style={styles.qrHint}>Scan to join</Text>
              <View style={styles.codeActionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
                  onPress={handleCopy}
                >
                  <Text style={styles.shareBtnText}>{copied ? 'Copied!' : 'Copy Code'}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
                  onPress={shareCode}
                >
                  <Text style={styles.shareBtnText}>Share invite</Text>
                </Pressable>
              </View>
            </View>

            <Text style={[themeText.label, { marginBottom: space.sm }]}>
              PLAYERS ({players.length}/{game.max_players})
            </Text>
            <View style={styles.playerList}>
              {players.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  isMe={p.user_id === myId}
                  showPresence
                  online={p.user_id === myId || isOnline(p.user_id)}
                />
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
    const winnerPlayer = round?.winner_is_bot
      ? botPlayer
      : round?.winner_player
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
                  <View style={styles.scoreNameRow}>
                    {!p.is_bot && p.user_id !== myId && (
                      <View style={[styles.presenceDotSmall, { backgroundColor: isOnline(p.user_id) ? colors.success : colors.textFaint }]} />
                    )}
                    <Text style={styles.scoreName} numberOfLines={1}>
                      {p.user_id === myId ? 'You' : playerLabel(p)}
                    </Text>
                  </View>
                  <Text style={styles.scoreValue}>{p.score}</Text>
                </View>
              ))}
            </View>

            {/* Board or setup indicator */}
            {(!round || round.status === 'awaiting_image') ? (
              <View style={{ gap: space.sm }}>
                <View style={styles.setupRow}>
                  <ActivityIndicator color={colors.blue} />
                  <Text style={styles.setupText}>Setting up round…</Text>
                </View>
                {hostOffline && (
                  <View style={styles.disconnectBanner}>
                    <Text style={styles.disconnectText}>The host appears to have disconnected.</Text>
                    <Pressable style={styles.disconnectBtn} onPress={() => router.replace('/home')}>
                      <Text style={styles.disconnectBtnText}>Leave match</Text>
                    </Pressable>
                  </View>
                )}
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

  const hasBot = !!botPlayer;

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <Confetti active={iWon} />
      <SafeAreaView style={styles.safe}>
        <Header title="Game over" onBack={() => router.replace('/home')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

          <View style={styles.finishedCard}>
            <GradientFill colors={iWon ? gradients.button : [colors.surface, colors.surfaceAlt]} />
            <Animated.Text entering={BounceIn.duration(700)} style={styles.finishedEmoji}>
              {iWon ? '🏆' : '🥈'}
            </Animated.Text>
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
            onPress={hasBot ? () => router.replace('/games/pixel-rush') : handleRematch}
            disabled={actionBusy}
          >
            <GradientFill colors={gradients.button} />
            {actionBusy
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.primaryBtnText}>{hasBot ? 'Find another match' : 'Rematch'}</Text>
            }
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.outlineBtn, { marginTop: space.sm }, pressed && styles.pressed]}
            onPress={handleShareToHome}
            disabled={shareState !== 'idle'}
          >
            {shareState === 'busy'
              ? <ActivityIndicator color={colors.textMuted} />
              : <Text style={styles.outlineBtnText}>{shareState === 'done' ? 'Shared ✓' : 'Share to Home'}</Text>
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
  showPresence,
  online,
  rank,
}: {
  player: GamePlayer;
  isMe: boolean;
  showScore?: boolean;
  showPresence?: boolean;
  online?: boolean;
  rank?: number;
}) {
  const isLast = rank === undefined;
  return (
    <View style={[styles.playerRow, isLast && styles.playerRowLast]}>
      <View style={styles.playerAvatarWrap}>
        <Avatar letter={playerLabel(player).charAt(0)} imageUrl={player.profile?.avatar_url ?? null} size={36} />
        {showPresence && !player.is_bot && (
          <View style={[styles.presenceDot, { backgroundColor: online ? colors.success : colors.textFaint }]} />
        )}
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
  codeActionsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  shareBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  shareBtnText: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  qrWrap: { marginTop: space.sm, padding: space.sm, backgroundColor: colors.white, borderRadius: radius.md },
  qrHint: { fontFamily: font.semibold, fontSize: 12, color: colors.textFaint },

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
  playerAvatarWrap: { width: 36, height: 36 },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.bg,
  },
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
  scoreNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  presenceDotSmall: { width: 7, height: 7, borderRadius: 4 },
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
  disconnectBanner: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    alignItems: 'center',
    gap: space.sm,
  },
  disconnectText: { fontFamily: font.semibold, fontSize: 13, color: colors.danger, textAlign: 'center' },
  disconnectBtn: { paddingVertical: 10, paddingHorizontal: space.lg, borderRadius: radius.md, backgroundColor: colors.danger },
  disconnectBtnText: { fontFamily: font.bold, fontSize: 13, color: colors.white },

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
