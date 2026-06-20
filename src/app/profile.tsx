import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../components/GradientFill';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

export default function Profile() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!session?.user) {
      setErrorMsg('Could not load your profile.');
      setLoading(false);
      return;
    }

    let active = true;
    supabase
      .from('profiles')
      .select('username, created_at')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setErrorMsg('Could not load your profile.');
        } else {
          setUsername(data.username);
          setJoinedAt(data.created_at);
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionLoading, session?.user?.id]);

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
          <Text style={themeText.h2}>Profile</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.blue} />
          </View>
        ) : errorMsg ? (
          <View style={styles.center}>
            <Text style={themeText.body}>{errorMsg}</Text>
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.avatar}>
              <GradientFill colors={gradients.featured} />
              <Text style={styles.avatarLetter}>{(username ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={[themeText.h1, styles.username]}>{username}</Text>
            <Text style={[themeText.hint, styles.email]}>{session?.user?.email}</Text>

            {joinedAt ? (
              <View style={styles.card}>
                <Text style={themeText.label}>MEMBER SINCE</Text>
                <Text style={[themeText.body, styles.cardValue]}>
                  {new Date(joinedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        )}
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

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  content: { flex: 1, alignItems: 'center', paddingTop: space.md },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
    ...shadow.blueGlow,
  },
  avatarLetter: { fontFamily: font.extrabold, fontSize: 38, color: colors.white },
  username: { marginBottom: space.xs },
  email: { marginBottom: space.xl },

  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.xs,
    ...shadow.card,
  },
  cardValue: { color: colors.text },
});
