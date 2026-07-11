import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Confetti } from '../../components/Confetti';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import PixelBoard from '../../components/PixelBoard';
import { goBackOr } from '../../lib/navigation';
import {
  PUZZLE_IMAGES,
  createBotMatch,
  createPixelRushGame,
  enqueueOrMatch,
  gridForRound,
  joinGame,
  leaveQueue,
} from '../../lib/usePixelGame';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

type Screen = 'menu' | 'solo' | 'mode' | 'group-size' | 'onevone' | 'searching';

const SEARCH_SECONDS = 30;
const MIN_GROUP = 3;
const MAX_GROUP = 8;

export default function PixelRushScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('menu');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Group + 1v1 setup
  const [groupSize, setGroupSize] = useState(4);
  const [anyoneCanJoin, setAnyoneCanJoin] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SEARCH_SECONDS);

  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  // Solo puzzle state — grid scales up each consecutive round, same progression as multiplayer.
  const [soloSeed, setSoloSeed] = useState(0);
  const [soloImage, setSoloImage] = useState(PUZZLE_IMAGES[0]);
  const [soloRound, setSoloRound] = useState(1);
  const [soloStartedAt, setSoloStartedAt] = useState(0);
  const [soloResult, setSoloResult] = useState<number | null>(null);

  function newSoloPuzzle() {
    setSoloSeed((Math.random() * 0x7fffffff) | 0);
    setSoloImage(PUZZLE_IMAGES[Math.floor(Math.random() * PUZZLE_IMAGES.length)]);
    setSoloStartedAt(Date.now());
    setSoloResult(null);
  }

  function startSolo() {
    setSoloRound(1);
    newSoloPuzzle();
    setScreen('solo');
  }

  function nextSoloPuzzle() {
    setSoloRound((r) => r + 1);
    newSoloPuzzle();
  }

  function stopSearching() {
    if (searchTimerRef.current) { clearInterval(searchTimerRef.current); searchTimerRef.current = null; }
  }

  useEffect(() => stopSearching, []);

  async function handleCreateGroup() {
    setBusy(true);
    setErr('');
    try {
      const game = await createPixelRushGame(groupSize);
      router.push(`/game/${game.invite_code}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleContinueOneVOne() {
    if (!anyoneCanJoin) {
      setBusy(true);
      setErr('');
      try {
        const game = await createPixelRushGame(2);
        router.push(`/game/${game.invite_code}`);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    await startMatchmaking();
  }

  // Polls enqueue_or_match every few seconds instead of matching only once —
  // two players who tap "anyone can join" moments apart won't see each other
  // on their first call, so whoever polls next is what actually pairs them.
  // The RPC is idempotent for an already-matched caller, so repeat calls are safe.
  async function pollForMatch() {
    if (cancelledRef.current) return;
    try {
      const game = await enqueueOrMatch('pixel_rush');
      if (cancelledRef.current) return;
      if (game) {
        stopSearching();
        router.push(`/game/${game.invite_code}`);
      }
    } catch (e) {
      stopSearching();
      setErr((e as Error).message);
      setScreen('onevone');
    }
  }

  async function startMatchmaking() {
    setBusy(true);
    setErr('');
    cancelledRef.current = false;
    try {
      const game = await enqueueOrMatch('pixel_rush');
      if (cancelledRef.current) return;
      if (game) {
        router.push(`/game/${game.invite_code}`);
        return;
      }

      setScreen('searching');
      setSecondsLeft(SEARCH_SECONDS);
      setBusy(false);

      let tick = 0;
      searchTimerRef.current = setInterval(() => {
        tick += 1;
        if (tick % 3 === 0) pollForMatch();
        setSecondsLeft((s) => {
          if (s <= 1) {
            handleSearchTimeout();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (e) {
      setBusy(false);
      setErr((e as Error).message);
      setScreen('onevone');
    }
  }

  async function handleSearchTimeout() {
    stopSearching();
    try {
      await leaveQueue('pixel_rush');
      const game = await createBotMatch('pixel_rush');
      router.push(`/game/${game.invite_code}`);
    } catch (e) {
      setErr((e as Error).message);
      setScreen('onevone');
    }
  }

  function cancelSearching() {
    cancelledRef.current = true;
    stopSearching();
    leaveQueue('pixel_rush').catch(() => {});
    setScreen('onevone');
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setErr('Enter a valid invite code.'); return; }
    setBusy(true);
    setErr('');
    try {
      await joinGame(code);
      router.push(`/game/${code}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ── Solo ──────────────────────────────────────────────────────

  if (screen === 'solo') {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <Confetti active={soloResult !== null} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={() => setScreen('menu')}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={themeText.h2}>Solo Practice</Text>
              <Text style={styles.soloGridHint}>Round {soloRound} · Grid {gridForRound(soloRound)}×{gridForRound(soloRound)}</Text>
            </View>
            <HeaderAvatar />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.soloContent}>
            <PixelBoard
              image={soloImage}
              seed={soloSeed}
              grid={gridForRound(soloRound)}
              startedAt={soloStartedAt}
              locked={soloResult !== null}
              onSolve={(ms) => setSoloResult(ms)}
            />

            {soloResult !== null && (
              <View style={styles.resultCard}>
                <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
                <Text style={styles.resultLabel}>
                  Finished in {(soloResult / 1000).toFixed(1)}s
                </Text>
                <View style={styles.resultActions}>
                  <Pressable
                    style={({ pressed }) => [styles.outlineBtn, pressed && styles.pressed]}
                    onPress={() => setScreen('menu')}
                  >
                    <Text style={styles.outlineBtnText}>Menu</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
                    onPress={nextSoloPuzzle}
                  >
                    <GradientFill colors={gradients.button} />
                    <Text style={styles.primaryBtnText}>Play again</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Mode choice: Group vs 1v1 ──────────────────────────────────

  if (screen === 'mode') {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={() => { setErr(''); setScreen('menu'); }}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            <Text style={themeText.h2}>Play Multiplayer</Text>
            <HeaderAvatar />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
            <Pressable
              style={({ pressed }) => [styles.modeCard, pressed && styles.pressed]}
              onPress={() => setScreen('group-size')}
            >
              <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
              <View style={styles.modeCardInner}>
                <View style={styles.modeText}>
                  <Text style={styles.modeTitle}>Group</Text>
                  <Text style={styles.modeSub}>Pick a size, get a QR code, link, and join code to send out.</Text>
                </View>
                <Text style={styles.modeChevron}>›</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.modeCard, styles.modeCardBlue, pressed && styles.pressed]}
              onPress={() => setScreen('onevone')}
            >
              <GradientFill colors={gradients.button} />
              <View style={styles.modeCardInner}>
                <View style={styles.modeText}>
                  <Text style={[styles.modeTitle, styles.modeTitleWhite]}>Continue (1v1)</Text>
                  <Text style={[styles.modeSub, styles.modeSubWhite]}>Just you and one opponent.</Text>
                </View>
                <Text style={[styles.modeChevron, { color: colors.white }]}>›</Text>
              </View>
            </Pressable>

            {!!err && <Text style={styles.errText}>{err}</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Group size picker ───────────────────────────────────────────

  if (screen === 'group-size') {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={() => { setErr(''); setScreen('mode'); }}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            <Text style={themeText.h2}>Group size</Text>
            <HeaderAvatar />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
            <View style={styles.stepperCard}>
              <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
              <Text style={styles.stepperLabel}>PLAYERS</Text>
              <View style={styles.stepperRow}>
                <Pressable
                  style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
                  onPress={() => setGroupSize((n) => Math.max(MIN_GROUP, n - 1))}
                  disabled={groupSize <= MIN_GROUP}
                >
                  <Text style={styles.stepperBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepperValue}>{groupSize}</Text>
                <Pressable
                  style={({ pressed }) => [styles.stepperBtn, pressed && styles.pressed]}
                  onPress={() => setGroupSize((n) => Math.min(MAX_GROUP, n + 1))}
                  disabled={groupSize >= MAX_GROUP}
                >
                  <Text style={styles.stepperBtnText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.stepperHint}>Group play is a Premium feature.</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              onPress={handleCreateGroup}
              disabled={busy}
            >
              <GradientFill colors={gradients.button} />
              {busy
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.primaryBtnText}>Create group →</Text>}
            </Pressable>

            {!!err && <Text style={styles.errText}>{err}</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── 1v1: anyone-can-join toggle ─────────────────────────────────

  if (screen === 'onevone') {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={() => { setErr(''); setScreen('mode'); }}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            <Text style={themeText.h2}>1v1</Text>
            <HeaderAvatar />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
            <View style={styles.toggleCard}>
              <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
              <View style={styles.toggleRow}>
                <View style={styles.modeText}>
                  <Text style={styles.modeTitle}>Let anyone join?</Text>
                  <Text style={styles.modeSub}>
                    {anyoneCanJoin
                      ? 'We’ll match you with a real opponent for 30s, then a machine if nobody joins.'
                      : 'Off — get a private code, link, and QR to invite a friend.'}
                  </Text>
                </View>
                <Switch
                  value={anyoneCanJoin}
                  onValueChange={setAnyoneCanJoin}
                  trackColor={{ false: colors.hairline, true: colors.blue }}
                  thumbColor={colors.white}
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
              onPress={handleContinueOneVOne}
              disabled={busy}
            >
              <GradientFill colors={gradients.button} />
              {busy
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.primaryBtnText}>Continue →</Text>}
            </Pressable>

            {!!err && <Text style={styles.errText}>{err}</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Searching: 30s wait for a real opponent ─────────────────────

  if (screen === 'searching') {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={[styles.safe, styles.center]}>
          <ActivityIndicator color={colors.blue} size="large" />
          <Text style={styles.searchingTitle}>Finding an opponent…</Text>
          <Text style={styles.searchingSub}>
            Starting a match against the machine in {secondsLeft}s if nobody joins.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.outlineBtn, { marginTop: space.xl }, pressed && styles.pressed]}
            onPress={cancelSearching}
          >
            <Text style={styles.outlineBtnText}>Cancel</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ── Menu ──────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => goBackOr(router, '/home')}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <Text style={themeText.h2}>🧩 Pixel Rush</Text>
          <HeaderAvatar />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
          <View style={styles.rulesCard}>
            <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
            <Text style={styles.rulesTitle}>How to play</Text>
            {RULES.map((rule, i) => (
              <Text key={i} style={styles.ruleRow}>
                <Text style={styles.ruleNum}>{i + 1}.{'  '}</Text>
                <Text style={styles.ruleText}>{rule}</Text>
              </Text>
            ))}
          </View>

          <Text style={[themeText.label, styles.sectionLabel]}>SOLO</Text>
          <Pressable
            style={({ pressed }) => [styles.modeCard, pressed && styles.pressed]}
            onPress={startSolo}
          >
            <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
            <View style={styles.modeCardInner}>
              <View style={styles.modeText}>
                <Text style={styles.modeTitle}>Solo practice</Text>
                <Text style={styles.modeSub}>Beat the clock on your own. No invite needed.</Text>
              </View>
              <Text style={styles.modeChevron}>›</Text>
            </View>
          </Pressable>

          <Text style={[themeText.label, styles.sectionLabel]}>MULTIPLAYER</Text>
          <Pressable
            style={({ pressed }) => [styles.modeCard, styles.modeCardBlue, pressed && styles.pressed]}
            onPress={() => { setErr(''); setScreen('mode'); }}
          >
            <GradientFill colors={gradients.button} />
            <View style={styles.modeCardInner}>
              <View style={styles.modeText}>
                <Text style={[styles.modeTitle, styles.modeTitleWhite]}>Play Multiplayer</Text>
                <Text style={[styles.modeSub, styles.modeSubWhite]}>
                  Group with a QR/link/code, or a quick 1v1.
                </Text>
              </View>
              <Text style={[styles.modeChevron, { color: colors.white }]}>›</Text>
            </View>
          </Pressable>

          <View style={styles.joinRow}>
            <TextInput
              style={styles.joinInput}
              placeholder="Enter invite code"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              value={joinCode}
              onChangeText={(t) => { setJoinCode(t.toUpperCase()); setErr(''); }}
              onSubmitEditing={handleJoin}
            />
            <Pressable
              style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed]}
              onPress={handleJoin}
              disabled={busy}
            >
              <Text style={styles.joinBtnText}>Join</Text>
            </Pressable>
          </View>

          {!!err && <Text style={styles.errText}>{err}</Text>}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const RULES = [
  'A photo is shown for 5 seconds — study it.',
  'It scatters into a grid — 3×3 early rounds, up to 5×5 as rounds progress.',
  'Tap two tiles to swap them and rebuild the original image.',
  'In multiplayer, fastest to solve the round takes the point. Best of 9 wins. 🏆',
];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    paddingBottom: space.xl,
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
  center: { alignItems: 'center', justifyContent: 'center' },

  // ── Solo layout
  soloGridHint: { fontFamily: font.semibold, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  soloContent: { paddingBottom: space.xl, gap: space.lg, alignItems: 'center' },
  resultCard: {
    alignSelf: 'stretch',
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    gap: space.md,
    ...shadow.card,
  },
  resultLabel: { fontFamily: font.extrabold, fontSize: 20, color: colors.text, textAlign: 'center' },
  resultActions: { flexDirection: 'row', gap: space.md },
  outlineBtn: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingVertical: space.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  outlineBtnText: { fontFamily: font.bold, fontSize: 15, color: colors.textMuted },
  primaryBtn: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingVertical: space.md,
    alignItems: 'center',
    ...shadow.blueGlow,
  },
  primaryBtnText: { fontFamily: font.bold, fontSize: 15, color: colors.white },

  // ── Menu layout
  menuContent: { paddingBottom: space.xl, gap: space.md },
  sectionLabel: { marginTop: space.sm },

  rulesCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    gap: space.sm,
    ...shadow.card,
  },
  rulesTitle: { fontFamily: font.extrabold, fontSize: 16, color: colors.text, marginBottom: 2 },
  ruleRow: { flexDirection: 'row' },
  ruleNum: { fontFamily: font.extrabold, fontSize: 14, color: colors.blue },
  ruleText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, flex: 1, lineHeight: 20 },

  modeCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.card,
  },
  modeCardBlue: { ...shadow.blueGlow },
  modeCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    gap: space.sm,
  },
  modeText: { flex: 1, gap: 4 },
  modeTitle: { fontFamily: font.extrabold, fontSize: 16, color: colors.text },
  modeTitleWhite: { color: colors.white },
  modeSub: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  modeSubWhite: { color: 'rgba(255,255,255,0.8)' },
  modeChevron: { fontFamily: font.extrabold, fontSize: 22, color: colors.textFaint },

  joinRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  joinInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.text,
    letterSpacing: 2,
    ...shadow.card,
  },
  joinBtn: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    justifyContent: 'center',
    ...shadow.blueGlow,
  },
  joinBtnText: { fontFamily: font.extrabold, fontSize: 15, color: colors.white },

  errText: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
  },

  // ── Group size stepper
  stepperCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    alignItems: 'center',
    gap: space.sm,
    ...shadow.card,
  },
  stepperLabel: { fontFamily: font.bold, fontSize: 12, color: colors.textFaint, letterSpacing: 1 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: { fontFamily: font.extrabold, fontSize: 22, color: colors.text },
  stepperValue: { fontFamily: font.black, fontSize: 40, color: colors.blue, minWidth: 60, textAlign: 'center' },
  stepperHint: { fontFamily: font.semibold, fontSize: 12, color: colors.textFaint },

  // ── 1v1 toggle
  toggleCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: space.lg,
    ...shadow.card,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },

  // ── Searching
  searchingTitle: {
    fontFamily: font.extrabold,
    fontSize: 20,
    color: colors.text,
    marginTop: space.lg,
    textAlign: 'center',
  },
  searchingSub: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: space.sm,
    textAlign: 'center',
    paddingHorizontal: space.lg,
  },
});
