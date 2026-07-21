import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { playSound } from '../../lib/sounds';
import { colors, font, gradients, radius, shadow, space } from '../../theme';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import { JoinModal } from '../../components/JoinModal';
import { GAMES } from '../(tabs)/games';

const MIN_ROUNDS = 5;
const MAX_ROUNDS = 15;

const GAME_RULES: Record<string, { title: string; desc: string }> = {
  'number-duel': {
    title: 'Number Duel',
    desc: 'Pick a secret number and guess your opponent\'s number first. Pay attention to the hints and lock in fast!',
  },
  'draughts': {
    title: 'Draughts',
    desc: 'Classic checkers, one on one. Forced captures, multi-jump chains, and flying kings. Create a room to play a friend.',
  },
};

export default function GameSetup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [joinVisible, setJoinVisible] = useState(false);
  const [settings, setSettings] = useState({
    rounds: MIN_ROUNDS,
    difficulty: 'easy',  // 'easy' = whole numbers, 'hard' = decimals
    mode: 'classic',     // 'classic', 'time_attack', 'blind_duel'
  });

  const rules = GAME_RULES[id!] || { title: 'Unknown Game', desc: 'Configure your room.' };
  // Theme the screen to the game (Number Duel's warm red-brown, not the
  // shared dark blue). Falls back to the app defaults for unknown games.
  const game = GAMES.find((g) => g.id === id);
  const theme = (game?.theme ?? gradients.background) as [string, string];
  const accent = game?.accent ?? colors.blue;

  const handleCreateRoom = async () => {
    if (creating) return;
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound('click');

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

  const updateSetting = (key: keyof typeof settings, value: string | number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('click');
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={theme} />
      <JoinModal visible={joinVisible} onClose={() => setJoinVisible(false)} />
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

          {/* Settings Section (Number Duel only) */}
          {id === 'number-duel' && (
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

            {/* Difficulty */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Difficulty</Text>
              <View style={styles.segmentedControl}>
                {['easy', 'hard'].map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => updateSetting('difficulty', d)}
                    style={[styles.segment, settings.difficulty === d && [styles.segmentActive, { borderColor: accent, borderWidth: 1.5 }]]}
                  >
                    <Text style={[styles.segmentText, settings.difficulty === d && styles.segmentTextActive]}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.settingNote, { color: accent }]}>
                {settings.difficulty === 'easy' ? 'Whole numbers (0–100).' : 'Decimals allowed (e.g. 42.5).'}
              </Text>
            </View>

            {/* Rounds */}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Rounds</Text>
              <View style={styles.stepper}>
                <Pressable
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, settings.rounds <= MIN_ROUNDS && styles.stepBtnDisabled]}
                  disabled={settings.rounds <= MIN_ROUNDS}
                  onPress={() => updateSetting('rounds', Math.max(MIN_ROUNDS, settings.rounds - 1))}
                >
                  <Text style={styles.stepBtnText}>−</Text>
                </Pressable>
                <Text style={styles.stepValue}>{settings.rounds}</Text>
                <Pressable
                  style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, settings.rounds >= MAX_ROUNDS && styles.stepBtnDisabled]}
                  disabled={settings.rounds >= MAX_ROUNDS}
                  onPress={() => updateSetting('rounds', Math.min(MAX_ROUNDS, settings.rounds + 1))}
                >
                  <Text style={styles.stepBtnText}>+</Text>
                </Pressable>
              </View>
              <Text style={[styles.settingNote, { color: accent }]}>Best of {settings.rounds} — first to {Math.ceil((settings.rounds + 1) / 2)} wins.</Text>
            </View>
          </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Pressable 
            style={({ pressed }) => [styles.cta, (creating) && styles.ctaDisabled, pressed && styles.pressed]} 
            onPress={handleCreateRoom}
            disabled={creating}
          >
            <GradientFill colors={theme} />
            {creating ? (
              <ActivityIndicator color={colors.white} style={{ paddingVertical: 18 }} />
            ) : (
              <Text style={styles.ctaText}>Create Room & Invite →</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.outlineBtn, creating && styles.ctaDisabled, pressed && styles.pressed]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); playSound('click'); setJoinVisible(true); }}
            disabled={creating}
          >
            <Text style={styles.outlineBtnText}>Join with a code</Text>
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
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xl, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingVertical: space.sm },
  stepBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  stepBtnDisabled: { opacity: 0.4 },
  stepBtnText: { fontFamily: font.black, fontSize: 24, color: colors.text, lineHeight: 26 },
  stepValue: { fontFamily: font.display, fontSize: 32, color: colors.text, minWidth: 48, textAlign: 'center' },
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
});
