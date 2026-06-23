import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import { GradientFill } from '../components/GradientFill';
import { supabase } from '../lib/supabase';
import { colors, font, gradients, radius, shadow, space } from '../theme';

export default function Login() {
  const router = useRouter();

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Improved Animations (Spring + Stagger)
  const logoIn = useSharedValue(0);
  const formIn = useSharedValue(0);
  
  useEffect(() => {
    logoIn.value = withSpring(1, { damping: 14, stiffness: 90 });
    formIn.value = withDelay(150, withSpring(1, { damping: 15, stiffness: 100 }));
  }, []);
  
  const logoStyle = useAnimatedStyle(() => ({
    opacity: withTiming(logoIn.value, { duration: 400 }),
    transform: [{ translateY: (1 - logoIn.value) * -20 }, { scale: 0.95 + (logoIn.value * 0.05) }],
  }));
  const formStyle = useAnimatedStyle(() => ({
    opacity: withTiming(formIn.value, { duration: 400 }),
    transform: [{ translateY: (1 - formIn.value) * 30 }],
  }));

  const haptic = () => {}; // haptics deferred (native module — re-add expo-haptics in a native build)

  const handleAuthResult = async (error: any, data: any) => {
    if (error) { setErrorMsg(error.message); return; }
    const { data: profile } = await supabase
      .from('profiles').select('username').eq('id', data.user.id).single();
    router.replace(profile?.username ? '/home' : '/onboarding');
  };

  const signInWithEmail = async () => {
    haptic();
    if (!email || !password) { setErrorMsg('Please enter your email and password.'); return; }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    // Try sign in
    const { error: signInError, data: signInData } = await supabase.auth.signInWithPassword({ email, password });

    if (!signInError) {
      setLoading(false);
      handleAuthResult(null, signInData);
      return;
    }

    // Try sign up if invalid credentials
    if (signInError.message.toLowerCase().includes('invalid login credentials')) {
      const { error: signUpError, data: signUpData } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (signUpError) {
        setErrorMsg(signUpError.message);
        return;
      }
      
      // If Victor sets up SMTP this will send an email. If Victor turns off confirmations, it logs in instantly.
      if (signUpData.user && signUpData.session === null) {
        setSuccessMsg('📬  Check your email for a confirmation link.');
        return;
      }
      handleAuthResult(null, signUpData);
      return;
    }

    setLoading(false);
    setErrorMsg(signInError.message);
  };

  const signInWithGoogle = async () => {
    haptic();
    if (Platform.OS === 'web') {
      await supabase.auth.signInWithOAuth({ 
        provider: 'google', 
        options: { redirectTo: window.location.origin + '/home' } 
      });
    } else {
      Alert.alert('Google Auth', 'Requires Victor\\'s EAS dev build for native support.');
    }
  };

  const signInWithApple = async () => {
    haptic();
    Alert.alert('Apple Auth', 'Requires Victor\\'s EAS dev build for native iOS support.');
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GradientFill colors={gradients.background} />

      <SafeAreaView style={styles.safe}>

        {/* ── Logo ─────────────────────────────────── */}
        <Animated.View style={[styles.logoArea, logoStyle]}>
          <View style={styles.logoRow}>
            <Text style={styles.xBig}>X</Text>
            <Text style={styles.antle}>antle</Text>
          </View>
          <Text style={styles.tagline}>Game night awaits.</Text>
        </Animated.View>

        {/* ── Auth card ────────────────────────────── */}
        <Animated.View style={[styles.card, formStyle]}>

          {successMsg ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}
          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Apple */}
          <SocialButton
            icon={<FontAwesome name="apple" size={22} color={colors.text} />}
            chipBg={colors.surfaceAlt}
            label="Continue with Apple"
            onPress={signInWithApple}
          />

          {/* Google */}
          <SocialButton
            icon={<FontAwesome name="google" size={20} color={colors.text} />}
            chipBg={colors.surfaceAlt}
            label="Continue with Google"
            onPress={signInWithGoogle}
          />

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email */}
          {!showEmailForm ? (
            <SocialButton
              icon={<FontAwesome name="envelope" size={16} color={colors.blue} />}
              chipBg={colors.surfaceAlt}
              label="Continue with Email"
              onPress={() => { haptic(); setShowEmailForm(true); }}
            />
          ) : (
            <View style={styles.emailSection}>
              <View style={styles.inputCard}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <View style={styles.inputSep} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.textFaint}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>

              <Pressable
                style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
                onPress={signInWithEmail}
                disabled={loading}
              >
                <View style={styles.ctaInner}>
                  <GradientFill colors={gradients.button} />
                  {loading
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={styles.ctaText}>Sign In / Sign Up</Text>
                  }
                </View>
              </Pressable>
            </View>
          )}
        </Animated.View>

      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/** Reusable social button row with left icon chip */
function SocialButton({
  icon, chipBg, label, onPress,
}: {
  icon: React.ReactNode;
  chipBg: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.iconChip, { backgroundColor: chipBg }]}>{icon}</View>
      <Text style={styles.socialLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center', gap: space.xl },

  // ── Logo
  logoArea: { alignItems: 'center' },
  logoRow: { flexDirection: 'row', alignItems: 'flex-end' },
  xBig: {
    fontFamily: font.display,
    fontSize: 80,
    lineHeight: 80,
    color: colors.text,
    includeFontPadding: false,
  },
  antle: {
    fontFamily: font.display,
    fontSize: 46,
    lineHeight: 46,
    color: colors.text,
    letterSpacing: -1,
    includeFontPadding: false,
    marginBottom: 6,
  },
  tagline: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: colors.textMuted,
    marginTop: space.sm,
    letterSpacing: 0.3,
  },

  // ── Auth card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },

  // Social buttons
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipGlyph: {
    fontFamily: font.extrabold,
    fontSize: 20,
    color: colors.text,
  },
  socialLabel: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.text,
  },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  dividerText: { fontFamily: font.semibold, fontSize: 12, color: colors.textFaint },

  // Email form
  emailSection: { gap: space.md },
  inputCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  input: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: colors.text,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  inputSep: { height: 1, backgroundColor: colors.hairline, marginHorizontal: space.md },

  // CTA
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  ctaInner: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, letterSpacing: 0.4 },

  // Success banner
  successBox: {
    backgroundColor: 'rgba(74,222,128,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.30)',
    borderRadius: radius.sm,
    padding: space.md,
  },
  successText: { fontFamily: font.semibold, fontSize: 14, color: '#4ADE80', textAlign: 'center' },

  // Error
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
    borderRadius: radius.sm,
    padding: space.md,
  },
  errorText: { fontFamily: font.semibold, fontSize: 14, color: colors.danger, textAlign: 'center' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
});
