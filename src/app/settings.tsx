import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../components/GradientFill';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

export default function Settings() {
  const router = useRouter();
  const { session } = useSession();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => router.back()}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <Text style={themeText.h2}>Settings</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.card}>
          <Text style={themeText.label}>SIGNED IN AS</Text>
          <Text style={[themeText.body, styles.cardValue]}>{session?.user?.email}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
          onPress={signOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Text style={[themeText.hint, styles.version]}>
          Xantle {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </SafeAreaView>
    </View>
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

  signOutBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },
  signOutText: { fontFamily: font.bold, fontSize: 16, color: colors.danger },

  version: { marginTop: 'auto', alignSelf: 'center', paddingBottom: space.lg },
});
