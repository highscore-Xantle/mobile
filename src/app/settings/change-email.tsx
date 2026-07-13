import { useEffect, useRef, useState } from 'react';
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
import { useGoBackOr } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_S = 30;

export default function ChangeEmail() {
  const goBack = useGoBackOr('/settings');
  const { session } = useSession();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resendIn, setResendIn] = useState(0);

  const otpInputRef = useRef<TextInput>(null);
  const valid = EMAIL_RE.test(email.trim());

  // Resend-code cooldown ticker
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  // Auto-verify as soon as the 6th digit lands — same UX as sign-in's OTP step.
  useEffect(() => {
    if (step === 'otp' && otp.length === 6 && !saving) {
      verifyChange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // Requests the change — Supabase emails a 6-digit code to the new address
  // (this app's auth is native-first and doesn't use link-based confirmation
  // anywhere else, see the detectSessionInUrl comment in lib/supabase.ts).
  const requestChange = async () => {
    if (!valid) return;
    setSaving(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) {
        setErrorMsg(error.message);
        return;
      }

      setStep('otp');
      setResendIn(RESEND_COOLDOWN_S);
      setTimeout(() => otpInputRef.current?.focus(), 50);
    } catch (e: any) {
      // A raw network/thrown exception (not a Supabase AuthError) would otherwise
      // leave saving stuck true forever with no feedback and no email sent.
      setErrorMsg(e?.message ?? 'Could not reach the server. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const verifyChange = async () => {
    if (otp.length !== 6) { setErrorMsg('Please enter the 6-digit code.'); return; }
    setSaving(true);
    setErrorMsg('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otp,
        type: 'email_change',
      });
      if (error) {
        setErrorMsg(error.message);
        setOtp('');
        return;
      }

      Alert.alert('Email updated', 'Your email address has been changed.');
      goBack();
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not reach the server. Check your connection and try again.');
      setOtp('');
    } finally {
      setSaving(false);
    }
  };

  const changeEmailAddress = () => {
    setStep('email');
    setOtp('');
    setErrorMsg('');
    setResendIn(0);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={goBack}
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

        {step === 'email' ? (
          <>
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
              onPress={requestChange}
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
          </>
        ) : (
          <>
            <Text style={styles.otpHint}>We sent a 6-digit code to {email.trim()}</Text>

            <View style={styles.inputWrap}>
              <TextInput
                ref={otpInputRef}
                style={styles.input}
                placeholder="6-digit code"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={verifyChange}
                value={otp}
                onChangeText={(v) => { setOtp(v.replace(/[^0-9]/g, '')); if (errorMsg) setErrorMsg(''); }}
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
                (otp.length !== 6) && styles.ctaDisabled,
                pressed && otp.length === 6 && styles.pressed,
              ]}
              onPress={verifyChange}
              disabled={otp.length !== 6 || saving}
            >
              <View style={styles.ctaInner}>
                {otp.length === 6 && <GradientFill colors={gradients.button} />}
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={[styles.ctaText, otp.length !== 6 && styles.ctaTextDim]}>Verify</Text>
                )}
              </View>
            </Pressable>

            <View style={styles.otpFooter}>
              <Pressable onPress={changeEmailAddress} hitSlop={8}>
                <Text style={styles.linkText}>Change email</Text>
              </Pressable>
              <Pressable onPress={requestChange} disabled={resendIn > 0 || saving} hitSlop={8}>
                <Text style={[styles.linkText, resendIn > 0 && styles.linkTextDim]}>
                  {resendIn > 0 ? `Resend code (${resendIn}s)` : 'Resend code'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },

  otpHint: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: space.md,
  },
  otpFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xs, marginTop: space.md },
  linkText: { fontFamily: font.bold, fontSize: 13, color: colors.blue },
  linkTextDim: { color: colors.textFaint },

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
    backgroundColor: 'rgba(248, 113, 113, 0.1)', // colors.danger tint
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
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
