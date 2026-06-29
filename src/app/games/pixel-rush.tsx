import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { GradientFill } from '../../components/GradientFill';
import PixelBoard from '../../components/PixelBoard';
import { goBackOr } from '../../lib/navigation';
import {
  DEFAULT_PUZZLE_IMAGE,
  createPixelRushGame,
  joinGame,
} from '../../lib/usePixelGame';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

type Screen = 'menu' | 'solo';

export default function PixelRushScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('menu');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Solo puzzle state
  const [soloSeed, setSoloSeed] = useState(0);
  const [soloStartedAt, setSoloStartedAt] = useState(0);
  const [soloResult, setSoloResult] = useState<number | null>(null);

  function startSolo() {
    setSoloSeed((Math.random() * 0x7fffffff) | 0);
    setSoloStartedAt(Date.now());
    setSoloResult(null);
    setScreen('solo');
  }

  async function handleCreate() {
    setBusy(true);
    setErr('');
    try {
      const game = await createPixelRushGame();
      router.push(`/game/${game.invite_code}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
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

  if (screen === 'solo') {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.topBar}>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={() => setScreen('menu')}
            >
              <Text style={styles.backGlyph}>‹</Text>
            </Pressable>
            <Text style={themeText.h2}>Solo Practice</Text>
            <View style={styles.backBtn} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.soloContent}>
            <PixelBoard
              image={DEFAULT_PUZZLE_IMAGE}
              seed={soloSeed}
              grid={3}
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
                    onPress={startSolo}
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
          <View style={styles.backBtn} />
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
            onPress={handleCreate}
            disabled={busy}
          >
            <GradientFill colors={gradients.button} />
            <View style={styles.modeCardInner}>
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <View style={styles.modeText}>
                    <Text style={[styles.modeTitle, styles.modeTitleWhite]}>Create 1v1 match</Text>
                    <Text style={[styles.modeSub, styles.modeSubWhite]}>
                      Get an invite code — opponent can join on web or mobile.
                    </Text>
                  </View>
                  <Text style={[styles.modeChevron, { color: colors.white }]}>›</Text>
                </>
              )}
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

  // ── Solo layout
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
});
