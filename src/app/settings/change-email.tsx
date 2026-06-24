import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../../components/GradientFill';
import { goBackOr } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChangeEmail() {
  const router = useRouter();
  const { session } = useSession();

  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const valid = EMAIL_RE.test(email.trim());

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase.auth.updateUser({ email: email.trim() });

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    Alert.alert('Check your inbox', 'We sent a confirmation link to your new email address.');
    goBackOr(router, '/settings');
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => goBackOr(router, '/settings')}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <Text style={themeText.h2}>Change email</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.card}>
          <Text style={themeText.label}>CURRENT EMAIL</Text>
          <Text style={[themeText.body, styles.cardValue]}>{session?.user?.email}</Text>
        </View>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="new@email.com"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        {errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.ctaBtn,
            !valid && styles.ctaDisabled,
            pressed && valid && styles.pressed,
          ]}
          onPress={handleSave}
          disabled={!valid || saving}
        >
          <View style={styles.ctaInner}>
            {valid && <GradientFill colors={gradients.button} />}
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={[styles.ctaText, !valid && styles.ctaTextDim]}>Save</Text>
            )}
          </View>
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

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

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.xs,
    marginBottom: space.lg,
    ...shadow.card,
  },
  cardValue: { color: colors.text },

  inputWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    paddingHorizontal: space.md,
    marginBottom: space.md,
    ...shadow.card,
  },
  input: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: colors.text,
    paddingVertical: space.md,
  },

  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: radius.sm,
    padding: space.md,
    marginBottom: space.md,
  },
  errorText: { color: colors.danger, fontFamily: font.semibold, fontSize: 14, textAlign: 'center' },

  ctaBtn: { borderRadius: radius.md, overflow: 'hidden', ...shadow.blueGlow },
  ctaDisabled: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  ctaInner: {
    paddingVertical: space.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, letterSpacing: 0.4 },
  ctaTextDim: { color: colors.textMuted },
});
