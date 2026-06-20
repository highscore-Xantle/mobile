import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../components/GradientFill';
import { supabase } from '../lib/supabase';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

// Native social sign-in (Apple / Google) + haptics need native modules that are
// NOT in the current SDK-54 dev build — deferred to a planned native-build cycle.
// Email auth works with no native module. See the "coming soon" handlers below.

export default function Login() {
  const router = useRouter();

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAuthResult = async (error: any, data: any) => {
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // Check if the user has a username. If not, they need to onboard.
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', data.user.id)
      .single();

    if (!profile?.username) {
      router.replace('/onboarding');
    } else {
      router.replace('/home');
    }
  };

  const signInWithEmail = async () => {
    setLoading(true);
    setErrorMsg('');
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });

    // No account yet? Fall back to sign-up.
    if (error && error.message.includes('Invalid login credentials')) {
      const { error: signUpError, data: signUpData } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (signUpError) {
        setErrorMsg(signUpError.message);
      } else if (signUpData.user && signUpData.session === null) {
        Alert.alert('Check your email', 'We sent you a confirmation link.');
      } else {
        handleAuthResult(signUpError, signUpData);
      }
      return;
    }

    setLoading(false);
    handleAuthResult(error, data);
  };

  const comingSoon = (provider: string) => () => {
    Alert.alert('Coming soon', `${provider} sign-in arrives in a later update — use email for now.`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={themeText.logo}>X</Text>
          <Text style={[themeText.h2, styles.subtitle]}>Sign in to Xantle</Text>
          <Text style={themeText.body}>Get ready for game night.</Text>
        </View>

        <View style={styles.formContainer}>
          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
            onPress={comingSoon('Apple')}
          >
            <Text style={styles.socialBtnText}>Continue with Apple</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
            onPress={comingSoon('Google')}
          >
            <Text style={styles.socialBtnText}>Continue with Google</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.line} />
          </View>

          {!showEmailForm ? (
            <Pressable
              style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
              onPress={() => setShowEmailForm(true)}
            >
              <Text style={styles.socialBtnText}>Continue with Email</Text>
            </Pressable>
          ) : (
            <View style={styles.emailForm}>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
              <View style={styles.inputWrap}>
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
                style={({ pressed }) => [styles.ctaBtn, pressed && styles.pressed]}
                onPress={signInWithEmail}
                disabled={loading}
              >
                <View style={styles.ctaInner}>
                  <GradientFill colors={gradients.button} />
                  {loading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.ctaText}>Sign In / Sign Up</Text>
                  )}
                </View>
              </Pressable>
            </View>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: space.xl * 1.5 },
  subtitle: { marginTop: space.sm, marginBottom: space.xs },

  formContainer: { gap: space.md },

  socialBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },
  socialBtnText: {
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.text,
  },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: space.sm, gap: space.md },
  line: { flex: 1, height: 1, backgroundColor: colors.hairline },
  orText: { fontFamily: font.semibold, color: colors.textFaint, fontSize: 13 },

  emailForm: { gap: space.md },
  inputWrap: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  input: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: colors.text,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },

  ctaBtn: { borderRadius: radius.md, overflow: 'hidden', ...shadow.blueGlow, marginTop: space.sm },
  ctaInner: {
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: font.extrabold,
    fontSize: 16,
    color: colors.white,
    letterSpacing: 0.5,
  },

  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: radius.sm,
    padding: space.md,
    alignItems: 'center',
  },
  errorText: {
    color: colors.danger,
    fontFamily: font.semibold,
    fontSize: 14,
    textAlign: 'center',
  },

  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});
