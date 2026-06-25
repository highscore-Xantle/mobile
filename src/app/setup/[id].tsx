import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { colors, font, gradients, radius, shadow, space } from '../../theme';
import { GradientFill } from '../../components/GradientFill';

const GAME_RULES: Record<string, { title: string; desc: string }> = {
  'number-duel': {
    title: 'Number Duel',
    desc: 'Pick a secret number and guess your opponent\'s number first. Pay attention to the hints and lock in fast!',
  },
};

export default function GameSetup() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [settings, setSettings] = useState({
    rounds: 12,
    difficulty: 'auto', // 'auto', 'easy', 'hardcore'
    mode: 'classic',    // 'classic', 'time_attack', 'blind_duel'
  });

  const rules = GAME_RULES[id!] || { title: 'Unknown Game', desc: 'Configure your room.' };

  const handleCreateRoom = async () => {
    if (creating) return;
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

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
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

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
          <View style={{ width: 60 }} />
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
          </View>
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
              <Text style={styles.ctaText}>Create Room & Invite →</Text>
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
  footer: { padding: space.lg, paddingTop: 0, paddingBottom: space.xl },
  cta: { borderRadius: radius.xl, overflow: 'hidden', ...shadow.blueGlow },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, textAlign: 'center', paddingVertical: 18 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
});
