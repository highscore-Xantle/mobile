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
import { useGoBackOr } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

const MIN_LEN = 8;

export default function ChangePassword() {
  const goBack = useGoBackOr('/settings');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const valid = password.length >= MIN_LEN && password === confirm;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    setErrorMsg('');

    const { error } = await supabase.auth.updateUser({ password });

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    Alert.alert('Password updated');
    goBack();
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
          <Text style={themeText.h2}>Change password</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />
        </View>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textFaint}
            secureTextEntry
            autoCapitalize="none"
            value={confirm}
            onChangeText={setConfirm}
          />
        </View>

        {confirm.length > 0 && password !== confirm ? (
          <Text style={styles.hint}>Passwords don't match</Text>
        ) : password.length > 0 && password.length < MIN_LEN ? (
          <Text style={styles.hint}>At least {MIN_LEN} characters</Text>
        ) : null}

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

  hint: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: colors.warning,
    marginBottom: space.md,
    marginTop: -space.xs,
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
