// Post-onboarding profile photo step. Shown right after username + location.
// - Google sign-in already carries a photo (stored in user_metadata by the
//   google-verify Edge Function) — we prefill it so the user can keep it.
// - Apple/email have no provider photo → we show an initials placeholder.
// The user can pick their own (uploaded to Cloudinary) or skip.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { uploadImage } from '../lib/cloudinary';
import { GradientFill } from '../components/GradientFill';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

export default function OnboardingPhoto() {
  const router = useRouter();
  const { session } = useSession();

  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [initial, setInitial] = useState('?');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!session?.user) return;
    const meta = session.user.user_metadata as { avatar_url?: string; picture?: string } | undefined;
    setProviderUrl(meta?.avatar_url ?? meta?.picture ?? null);
    // Placeholder initial: prefer the username just chosen, else the email.
    supabase
      .from('profiles').select('username').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => {
        const src = data?.username || session.user.email || '?';
        setInitial(src.charAt(0).toUpperCase());
      });
  }, [session?.user?.id]);

  const preview = localUri ?? providerUrl;

  const pickImage = async () => {
    setErrorMsg('');
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setErrorMsg('Photo access was denied — enable it in Settings, or skip for now.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) setLocalUri(result.assets[0].uri);
  };

  // finalUrl: what to store. A freshly-picked local image is uploaded first;
  // a provider URL is stored as-is; null leaves the initials placeholder.
  const saveAndContinue = async (finalUrl: string | null) => {
    if (!session?.user || busy) return;
    setBusy(true);
    setErrorMsg('');
    try {
      let avatarUrl = finalUrl;
      if (finalUrl && finalUrl === localUri) avatarUrl = await uploadImage(localUri);
      if (avatarUrl) {
        const { error } = await supabase
          .from('profiles').update({ avatar_url: avatarUrl }).eq('id', session.user.id);
        if (error) throw error;
      }
      router.replace('/home');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Could not save your photo. Please try again.');
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.headingRow}>
          <View style={styles.accentBar} />
          <View style={styles.headingText}>
            <Text style={themeText.h1}>Add a</Text>
            <Text style={[themeText.h1, styles.headingCyan]}>photo.</Text>
            <Text style={styles.subtitle}>
              {providerUrl
                ? 'We brought your photo across — keep it or choose another.'
                : 'Put a face to your name. You can always change it later.'}
            </Text>
          </View>
        </View>

        <View style={styles.center}>
          <Pressable onPress={pickImage} style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}>
            {preview ? (
              <Image source={{ uri: preview }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <FontAwesome name="camera" size={14} color={colors.white} />
            </View>
          </Pressable>
          <Pressable onPress={pickImage} hitSlop={8}>
            <Text style={styles.chooseText}>{preview ? 'Choose another photo' : 'Choose a photo'}</Text>
          </Pressable>
        </View>

        {errorMsg ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{errorMsg}</Text></View>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            onPress={() => saveAndContinue(localUri ?? providerUrl)}
            disabled={busy}
          >
            <View style={styles.ctaInner}>
              <GradientFill colors={gradients.button} />
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.ctaText}>Continue →</Text>}
            </View>
          </Pressable>
          <Pressable onPress={() => saveAndContinue(providerUrl)} disabled={busy} hitSlop={8}>
            <Text style={styles.skipText}>Skip for now</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const AVATAR = 148;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'space-between', paddingVertical: space.xl },

  headingRow: { flexDirection: 'row', gap: space.md },
  accentBar: { width: 4, borderRadius: 2, backgroundColor: colors.blue },
  headingText: { flex: 1 },
  headingCyan: { color: colors.blue },
  subtitle: { fontFamily: font.semibold, fontSize: 15, color: colors.textMuted, marginTop: space.sm, lineHeight: 21 },

  center: { alignItems: 'center', gap: space.lg },
  avatarWrap: { width: AVATAR, height: AVATAR },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: colors.surfaceAlt },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.hairline },
  avatarInitial: { fontFamily: font.display, fontSize: 64, color: colors.textMuted },
  editBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.bg,
  },
  chooseText: { fontFamily: font.bold, fontSize: 15, color: colors.blue },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)',
    borderRadius: radius.sm, padding: space.md,
  },
  errorText: { fontFamily: font.semibold, fontSize: 14, color: colors.danger, textAlign: 'center' },

  actions: { gap: space.md },
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  ctaInner: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, letterSpacing: 0.4 },
  skipText: { fontFamily: font.semibold, fontSize: 15, color: colors.textFaint, textAlign: 'center' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
});
