import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { leaveQueue } from '../../lib/usePixelGame';
import { createBotRoom, enqueueOrMatchRoom } from '../../lib/useNumberDuel';
import { colors, font, gradients, radius, shadow, space } from '../../theme';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';

const GAME_RULES: Record<string, { title: string; desc: string }> = {
  'number-duel': {
    title: 'Number Duel',
    desc: 'Pick a secret number and guess your opponent\'s number first. Pay attention to the hints and lock in fast!',
  },
};

const SEARCH_SECONDS = 30;
const QUEUE_TYPE = 'number-duel';

export default function GameSetup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [anyoneCanJoin, setAnyoneCanJoin] = useState(false);
  const [screen, setScreen] = useState<'rules' | 'searching'>('rules');
  const [secondsLeft, setSecondsLeft] = useState(SEARCH_SECONDS);
  const [err, setErr] = useState('');
  const [settings, setSettings] = useState({
    rounds: 12,
    difficulty: 'auto', // 'auto', 'easy', 'hardcore'
    mode: 'classic',    // 'classic', 'time_attack', 'blind_duel'
  });

  const searchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  // Guards against a double navigation when a poll and the 30s timeout resolve
  // in the same tick (same race pixel-rush.tsx guards against).
  const enteredRef = useRef(false);

  const rules = GAME_RULES[id!] || { title: 'Unknown Game', desc: 'Configure your room.' };

  function stopSearching() {
    if (searchTimerRef.current) { clearInterval(searchTimerRef.current); searchTimerRef.current = null; }
  }
  useEffect(() => stopSearching, []);

  function enterRoom(code: string) {
    if (enteredRef.current) return;
    enteredRef.current = true;
    cancelledRef.current = true;
    stopSearching();
    setCreating(false);
    router.replace({ pathname: '/game/[id]', params: { id: id!, roomCode: code } });
  }

  const handleCreateRoom = async () => {
    if (creating) return;
    setCreating(true);
    setErr('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (anyoneCanJoin) {
      await startMatchmaking();
      return;
    }

    // Call create_room with the specific settings baked into the room state!
    const { data: room, error } = await supabase.rpc('create_room', {
      p_game_kind: id,
      p_state: settings,
      p_is_group: false,
      p_max: 2,
    });

    if (error) {
      Alert.alert('Error creating room', error.message);
      setCreating(false);
      return;
    }

    router.replace(`/room/${room.code}`);
  };

  // Polls enqueue_or_match_room every few seconds instead of matching only
  // once — two players who tap "anyone can join" moments apart won't see
  // each other on their first call, so whoever polls next is what pairs them.
  async function pollForMatch() {
    if (cancelledRef.current) return;
    try {
      const room = await enqueueOrMatchRoom(settings);
      if (cancelledRef.current) return;
      if (room) enterRoom(room.code);
    } catch (e) {
      stopSearching();
      setErr((e as Error).message);
      setScreen('rules');
      setCreating(false);
    }
  }

  async function startMatchmaking() {
    cancelledRef.current = false;
    enteredRef.current = false;
    try {
      const room = await enqueueOrMatchRoom(settings);
      if (cancelledRef.current) return;
      if (room) { enterRoom(room.code); return; }

      setScreen('searching');
      setSecondsLeft(SEARCH_SECONDS);
      setCreating(false);

      let tick = 0;
      searchTimerRef.current = setInterval(() => {
        tick += 1;
        if (tick % 3 === 0) pollForMatch();
        setSecondsLeft((s) => {
          if (s <= 1) { handleSearchTimeout(); return 0; }
          return s - 1;
        });
      }, 1000);
    } catch (e) {
      setCreating(false);
      setErr((e as Error).message);
      setScreen('rules');
    }
  }

  async function handleSearchTimeout() {
    stopSearching();
    // Suppress any in-flight poll from also navigating, then do ONE final
    // enqueue: if a real opponent paired with us in the last seconds, use
    // that match (idempotent) instead of abandoning them for a bot.
    cancelledRef.current = true;
    try {
      const lastChance = await enqueueOrMatchRoom(settings);
      if (lastChance) { enterRoom(lastChance.code); return; }
      await leaveQueue(QUEUE_TYPE);
      const room = await createBotRoom(settings);
      enterRoom(room.code);
    } catch (e) {
      setErr((e as Error).message);
      setScreen('rules');
      setCreating(false);
    }
  }

  function cancelSearching() {
    cancelledRef.current = true;
    stopSearching();
    leaveQueue(QUEUE_TYPE).catch(() => {});
    setCreating(false);
    setScreen('rules');
  }

  const updateSetting = (key: keyof typeof settings, value: string | number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

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
            style={({ pressed }) => [styles.outlineBtn, { marginTop: space.xl, alignSelf: 'stretch' }, pressed && styles.pressed]}
            onPress={cancelSearching}
          >
            <Text style={styles.outlineBtnText}>Cancel</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.headerTitle}>GAME SETUP</Text>
          <HeaderAvatar />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Rules Card */}
          <View style={styles.rulesCard}>
            <Text style={styles.gameTitle}>{rules.title}</Text>
            <Text style={styles.gameDesc}>{rules.desc}</Text>
          </View>

          {/* Settings Section */}
          <View style={styles.settingsSection}>
            <Text style={styles.sectionHeader}>Configure Rules</Text>
            
            {/* Mode */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Mode</Text>
              <View style={styles.segmentedControl}>
                {['classic', 'time_attack', 'blind_duel'].map((m) => (
                  <Pressable 
                    key={m} 
                    onPress={() => updateSetting('mode', m)}
                    style={[styles.segment, settings.mode === m && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, settings.mode === m && styles.segmentTextActive]}>
                      {m === 'classic' ? 'Classic' : m === 'time_attack' ? 'Time Attack' : 'Blind Duel'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {settings.mode === 'time_attack' && <Text style={styles.settingNote}>15s limit per guess. Timeout = instant loss.</Text>}
              {settings.mode === 'blind_duel' && <Text style={styles.settingNote}>No higher/lower hints. Only Hot/Warm/Cold.</Text>}
            </View>

            {/* Rounds */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Rounds</Text>
              <View style={styles.segmentedControl}>
                {[3, 5, 12].map((r) => (
                  <Pressable 
                    key={r} 
                    onPress={() => updateSetting('rounds', r)}
                    style={[styles.segment, settings.rounds === r && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, settings.rounds === r && styles.segmentTextActive]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Difficulty */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Difficulty</Text>
              <View style={styles.segmentedControl}>
                {['auto', 'easy', 'hardcore'].map((d) => (
                  <Pressable 
                    key={d} 
                    onPress={() => updateSetting('difficulty', d)}
                    style={[styles.segment, settings.difficulty === d && styles.segmentActive]}
                  >
                    <Text style={[styles.segmentText, settings.difficulty === d && styles.segmentTextActive]}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {settings.difficulty === 'auto' && <Text style={styles.settingNote}>Starts easy, decimals get added later.</Text>}
              {settings.difficulty === 'hardcore' && <Text style={styles.settingNote}>2 decimals required immediately.</Text>}
            </View>

            {/* Anyone can join */}
            <View style={styles.toggleCard}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.settingLabel}>Let anyone join?</Text>
                  <Text style={styles.settingNote}>
                    {anyoneCanJoin
                      ? "We'll match you with a real opponent for 30s, then a machine if nobody joins."
                      : 'Off — get a private code and link to invite a friend.'}
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
          </View>

          {!!err && <Text style={styles.errText}>{err}</Text>}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable
            style={({ pressed }) => [styles.cta, (creating) && styles.ctaDisabled, pressed && styles.pressed]}
            onPress={handleCreateRoom}
            disabled={creating}
          >
            <GradientFill colors={gradients.button} />
            {creating ? (
              <ActivityIndicator color={colors.white} style={{ paddingVertical: 18 }} />
            ) : (
              <Text style={styles.ctaText}>{anyoneCanJoin ? 'Continue →' : 'Create Room & Invite →'}</Text>
            )}
          </Pressable>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md },
  backBtn: { padding: space.xs },
  backText: { fontFamily: font.bold, fontSize: 14, color: colors.textFaint },
  headerTitle: { fontFamily: font.black, fontSize: 16, color: colors.text, letterSpacing: 1 },
  content: { padding: space.lg, gap: space.xl, paddingBottom: 48 },
  rulesCard: { backgroundColor: colors.surface, padding: space.xl, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', ...shadow.card },
  gameTitle: { fontFamily: font.display, fontSize: 28, color: colors.text, marginBottom: space.sm },
  gameDesc: { fontFamily: font.semibold, fontSize: 15, color: colors.textMuted, lineHeight: 22 },
  settingsSection: { gap: space.xl },
  sectionHeader: { fontFamily: font.black, fontSize: 16, color: colors.text, textTransform: 'uppercase', letterSpacing: 1 },
  settingRow: { gap: space.sm },
  settingLabel: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted },
  settingNote: { fontFamily: font.semibold, fontSize: 12, color: colors.blue, fontStyle: 'italic', marginTop: 4 },
  segmentedControl: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surface, ...shadow.card },
  segmentText: { fontFamily: font.semibold, fontSize: 13, color: colors.textFaint },
  segmentTextActive: { color: colors.text, fontFamily: font.bold },
  footer: { padding: space.lg, paddingTop: 0, paddingBottom: space.xl, gap: space.sm },
  cta: { borderRadius: radius.xl, overflow: 'hidden', ...shadow.blueGlow },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, textAlign: 'center', paddingVertical: 18 },
  outlineBtn: {
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.hairline,
    paddingVertical: 16, alignItems: 'center', backgroundColor: colors.surface,
  },
  outlineBtnText: { fontFamily: font.bold, fontSize: 15, color: colors.textMuted },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },

  center: { alignItems: 'center', justifyContent: 'center' },
  toggleCard: {
    backgroundColor: colors.surface, padding: space.lg, borderRadius: radius.xl,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', ...shadow.card,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  errText: { fontFamily: font.semibold, fontSize: 13, color: colors.danger, textAlign: 'center', marginTop: space.sm },
  searchingTitle: {
    fontFamily: font.extrabold, fontSize: 20, color: colors.text,
    marginTop: space.lg, textAlign: 'center',
  },
  searchingSub: {
    fontFamily: font.semibold, fontSize: 14, color: colors.textMuted,
    marginTop: space.sm, textAlign: 'center', paddingHorizontal: space.lg,
  },
});
