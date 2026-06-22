import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { GradientFill } from '../components/GradientFill';
import { RolloverReveal } from '../components/RolloverReveal';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

const MIN_LEN = 3;
const MAX_LEN = 20;
const VALID_RE = /^[a-zA-Z0-9_]+$/;

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function Onboarding() {
  const router = useRouter();
  const { session } = useSession();

  const [username, setUsername] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  let debounceTimer: ReturnType<typeof setTimeout>;

  const handleChange = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    setUsername(trimmed);
    setErrorMsg('');
    if (trimmed.length < MIN_LEN) { setCheckState('idle'); return; }
    if (trimmed.length > MAX_LEN || !VALID_RE.test(trimmed)) { setCheckState('invalid'); return; }
    clearTimeout(debounceTimer);
    setCheckState('checking');
    debounceTimer = setTimeout(() => checkAvailability(trimmed), 600);
  };

  const checkAvailability = async (value: string) => {
    const { data, error } = await supabase
      .from('profiles').select('username').eq('username', value).maybeSingle();
    if (error) { setCheckState('idle'); return; }
    setCheckState(data ? 'taken' : 'available');
    Haptics.notificationAsync(
      data
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Success
    );
  };

  const handleConfirm = async () => {
    if (checkState !== 'available' || !session?.user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    setErrorMsg('');
    const { error } = await supabase
      .from('profiles').update({ username }).eq('id', session.user.id);
    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/home');
  };

  // Status pill config
  type StatusConfig = { label: string; color: string; bg: string } | null;
  const statusConfig: Record<CheckState, StatusConfig> = {
    idle: null,
    checking: { label: 'Checking…', color: colors.textMuted, bg: 'rgba(147,155,167,0.12)' },
    available: { label: '✓  Available', color: '#4ADE80', bg: 'rgba(74,222,128,0.12)' },
    taken: { label: '✗  Already taken', color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
    invalid: { label: `Letters, numbers, _ · ${MIN_LEN}–${MAX_LEN} chars`, color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
  };
  const statusPill = statusConfig[checkState];
  const ctaEnabled = checkState === 'available' && !saving;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientFill colors={gradients.background} />

      <SafeAreaView style={styles.safe}>

        {/* ── Heading with cyan accent bar ────────── */}
        <RolloverReveal delay={80} duration={750}>
          <View style={styles.headingRow}>
            <View style={styles.accentBar} />
            <View style={styles.headingText}>
              <Text style={themeText.h1}>Pick your</Text>
              <Text style={[themeText.h1, styles.headingCyan]}>name.</Text>
              <Text style={styles.subtitle}>
                This is how other players see you.{'\n'}Choose wisely — it's permanent.
              </Text>
            </View>
          </View>
        </RolloverReveal>

        {/* ── Input card ──────────────────────────── */}
        <RolloverReveal delay={260} duration={750} style={styles.inputSection}>

          {/* Floating input card */}
          <View style={[
            styles.inputCard,
            checkState === 'available' && styles.inputCardGreen,
            checkState === 'taken' && styles.inputCardRed,
          ]}>
            <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
            <View style={styles.inputRow}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                style={styles.input}
                placeholder="your_username"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={MAX_LEN}
                value={username}
                onChangeText={handleChange}
              />
              {checkState === 'checking' && (
                <ActivityIndicator size="small" color={colors.textMuted} style={styles.spinner} />
              )}
            </View>
          </View>

          {/* Status pill */}
          {statusPill && (
            <View style={[styles.statusPill, { backgroundColor: statusPill.bg }]}>
              <Text style={[styles.statusText, { color: statusPill.color }]}>
                {statusPill.label}
              </Text>
            </View>
          )}

          {/* Supabase error */}
          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.cta,
              !ctaEnabled && styles.ctaDisabled,
              pressed && ctaEnabled && styles.pressed,
            ]}
            onPress={handleConfirm}
            disabled={!ctaEnabled}
          >
            <View style={styles.ctaInner}>
              {ctaEnabled && <GradientFill colors={gradients.button} />}
              {saving
                ? <ActivityIndicator color={colors.white} />
                : <Text style={[styles.ctaText, !ctaEnabled && styles.ctaTextDim]}>
                    Let's go →
                  </Text>
              }
            </View>
          </Pressable>

        </RolloverReveal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center', gap: space.xl },

  // ── Heading
  headingRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  accentBar: {
    width: 5,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.cyan,
    marginTop: 4,
  },
  headingText: { flex: 1, gap: space.xs },
  headingCyan: { color: colors.cyan, marginTop: -8 },
  subtitle: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: space.sm,
  },

  // ── Input section
  inputSection: { gap: space.md },

  inputCard: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  inputCardGreen: { borderColor: '#4ADE80' },
  inputCardRed: { borderColor: '#F87171' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  atSign: {
    fontFamily: font.extrabold,
    fontSize: 20,
    color: colors.textFaint,
    marginRight: space.xs,
  },
  input: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.text,
    paddingVertical: space.lg,
  },
  spinner: { marginRight: space.sm },

  // Status pill
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusText: { fontFamily: font.bold, fontSize: 13 },

  // Error
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
    borderRadius: radius.sm,
    padding: space.md,
  },
  errorText: { fontFamily: font.semibold, fontSize: 14, color: '#F87171', textAlign: 'center' },

  // CTA
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  ctaDisabled: { opacity: 0.35, shadowOpacity: 0, elevation: 0 },
  ctaInner: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, letterSpacing: 0.4 },
  ctaTextDim: { color: colors.textMuted },

  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
});
