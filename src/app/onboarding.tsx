import { useRef, useState } from 'react';
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
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { GradientFill } from '../components/GradientFill';
import { RolloverReveal } from '../components/RolloverReveal';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

const MIN_LEN = 3;
const MAX_LEN = 20;
// Only letters, numbers, underscores — no spaces or special chars
const VALID_RE = /^[a-zA-Z0-9_]+$/;

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function Onboarding() {
  const router = useRouter();
  const { session } = useSession();

  const [username, setUsername] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Debounce ref so we don't hammer Supabase on every keystroke
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    setUsername(trimmed);
    setErrorMsg('');

    if (trimmed.length < MIN_LEN) {
      setCheckState('idle');
      return;
    }
    if (trimmed.length > MAX_LEN || !VALID_RE.test(trimmed)) {
      setCheckState('invalid');
      return;
    }

    // Start debounce — wait 600ms after user stops typing, then check
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setCheckState('checking');
    debounceTimer.current = setTimeout(() => checkAvailability(trimmed), 600);
  };

  const checkAvailability = async (value: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', value)
      .maybeSingle();

    if (error) {
      setCheckState('idle');
      return;
    }
    setCheckState(data ? 'taken' : 'available');
  };

  const handleConfirm = async () => {
    if (checkState !== 'available' || !session?.user) return;
    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase
      .from('profiles')
      .update({ username })
      .eq('id', session.user.id);

    setSaving(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // Username saved — head to home
    router.replace('/home');
  };

  const statusConfig: Record<CheckState, { text: string; color: string } | null> = {
    idle: null,
    checking: { text: 'Checking availability…', color: colors.textMuted },
    available: { text: '✓ Available', color: colors.success },
    taken: { text: '✗ Already taken', color: colors.danger },
    invalid: {
      text: `Letters, numbers and _ only · ${MIN_LEN}–${MAX_LEN} chars`,
      color: colors.warning,
    },
  };
  const status = statusConfig[checkState];
  const ctaEnabled = checkState === 'available' && !saving;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientFill colors={gradients.background} />

      <SafeAreaView style={styles.safe}>
        <RolloverReveal delay={80} duration={800}>
          <View style={styles.header}>
            <Text style={themeText.h1}>Pick your name.</Text>
            <Text style={[themeText.body, styles.subtitle]}>
              This is how other players will see you.{'\n'}Choose wisely — you can't change it later.
            </Text>
          </View>
        </RolloverReveal>

        <RolloverReveal delay={300} duration={800} style={styles.formWrap}>
          {/* Input */}
          <View
            style={[
              styles.inputWrap,
              checkState === 'available' && styles.inputBorderGreen,
              checkState === 'taken' && styles.inputBorderRed,
            ]}
          >
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
              <ActivityIndicator size="small" color={colors.textMuted} />
            )}
          </View>

          {/* Status hint */}
          {status && (
            <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
          )}

          {/* Error from Supabase write */}
          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.ctaBtn,
              !ctaEnabled && styles.ctaDisabled,
              pressed && ctaEnabled && styles.pressed,
            ]}
            onPress={handleConfirm}
            disabled={!ctaEnabled}
          >
            <View style={styles.ctaInner}>
              {ctaEnabled && <GradientFill colors={gradients.button} />}
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={[styles.ctaText, !ctaEnabled && styles.ctaTextDim]}>
                  Let's go →
                </Text>
              )}
            </View>
          </Pressable>
        </RolloverReveal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center' },

  header: { marginBottom: space.xl },
  subtitle: { marginTop: space.sm, color: colors.textMuted, lineHeight: 22 },

  formWrap: { gap: space.md },

  // Input row
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    paddingHorizontal: space.md,
    ...shadow.card,
  },
  inputBorderGreen: { borderColor: colors.success },
  inputBorderRed: { borderColor: colors.danger },
  atSign: {
    fontFamily: font.extrabold,
    fontSize: 18,
    color: colors.textFaint,
    marginRight: space.xs,
  },
  input: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.text,
    paddingVertical: space.md,
  },

  statusText: {
    fontFamily: font.semibold,
    fontSize: 13,
    marginTop: -space.xs,
  },

  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: radius.sm,
    padding: space.md,
  },
  errorText: {
    color: colors.danger,
    fontFamily: font.semibold,
    fontSize: 14,
    textAlign: 'center',
  },

  // CTA
  ctaBtn: {
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.blueGlow,
    marginTop: space.sm,
  },
  ctaDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaInner: {
    paddingVertical: space.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ctaText: {
    fontFamily: font.extrabold,
    fontSize: 17,
    color: colors.white,
    letterSpacing: 0.4,
  },
  ctaTextDim: { color: colors.textMuted },

  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});
