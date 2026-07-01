import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../../components/GradientFill';
import {
  isPushSupported,
  registerForPushNotifications,
  unregisterPushNotifications,
} from '../../lib/pushNotifications';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { useProfileCompletion } from '../../lib/useProfileCompletion';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

export default function Settings() {
  const router = useRouter();
  const { session } = useSession();

  const pushSupported = isPushSupported();
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifBusy, setNotifBusy]       = useState(false);
  const [deleting, setDeleting]         = useState(false);

  const profileCompletion = useProfileCompletion(session?.user?.id);

  useEffect(() => {
    if (!pushSupported || !session?.user) return;
    supabase
      .from('push_tokens')
      .select('token')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setNotifEnabled(!!data));
  }, [pushSupported, session?.user?.id]);

  const toggleNotifications = async (value: boolean) => {
    if (!session?.user) return;
    setNotifBusy(true);

    try {
      if (value) {
        const token = await registerForPushNotifications(session.user.id);
        setNotifEnabled(!!token);
        if (!token) {
          Alert.alert(
            'Notifications off',
            'Couldn\'t turn on notifications. Make sure they\'re allowed for Xantle in your device settings, then try again.',
          );
        }
      } else {
        await unregisterPushNotifications(session.user.id);
        setNotifEnabled(false);
      }
    } catch (err) {
      console.warn('[settings] notification toggle failed:', err);
      setNotifEnabled(!value);
      Alert.alert('Something went wrong', 'Could not update notification settings. Try again.');
    } finally {
      setNotifBusy(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const closeAccount = () => {
    Alert.alert(
      'Close account',
      'This permanently deletes your account and all your data. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.rpc('delete_account');
            if (error) {
              setDeleting(false);
              Alert.alert('Could not close account', error.message);
              return;
            }
            await supabase.auth.signOut();
            router.replace('/login');
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={themeText.h2}>Settings</Text>
        </View>

        <View style={styles.card}>
          <Text style={themeText.label}>SIGNED IN AS</Text>
          <Text style={[themeText.body, styles.cardValue]}>{session?.user?.email}</Text>
        </View>

        <Text style={[themeText.label, styles.sectionLabel]}>ACCOUNT</Text>
        <View style={styles.group}>
          {/* Profile completion row — only shown when incomplete */}
          {!profileCompletion.loading && !profileCompletion.isComplete && (
            <Pressable
              style={({ pressed }) => [styles.completionRow, pressed && { opacity: 0.8 }]}
              onPress={() => router.push('/onboarding' as any)}
              accessibilityLabel={`Complete your profile — ${profileCompletion.completionPercent}% done`}
              accessibilityRole="button"
            >
              <View style={styles.completionLeft}>
                <Text style={styles.completionTitle}>Complete your profile</Text>
                <View style={styles.completionBarTrack}>
                  <View style={[styles.completionBarFill, { width: `${profileCompletion.completionPercent}%` as any }]} />
                </View>
                <Text style={styles.completionHint}>{profileCompletion.completionPercent}% complete</Text>
              </View>
              <Text style={styles.completionArrow}>›</Text>
            </Pressable>
          )}
          <Row label="Change email" onPress={() => router.push('/settings/change-email')} />
          <Row label="Change password" onPress={() => router.push('/settings/change-password')} />
          <ToggleRow
            label="Push notifications"
            value={pushSupported && notifEnabled}
            disabled={!pushSupported || notifBusy}
            onValueChange={toggleNotifications}
            hint={pushSupported ? undefined : 'Not available on web'}
            last
          />
        </View>

        <Text style={[themeText.label, styles.sectionLabel]}>LEGAL</Text>
        <View style={styles.group}>
          <Row label="Privacy policy" onPress={() => router.push('/settings/policy')} />
          <Row label="Terms & conditions" onPress={() => router.push('/settings/terms')} />
          <Row label="About" onPress={() => router.push('/settings/about')} last />
        </View>

        <Pressable
          style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
          onPress={signOut}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.closeAccountBtn, pressed && styles.pressed]}
          onPress={closeAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.closeAccountText}>Close account</Text>
          )}
        </Pressable>

        <Text style={[themeText.hint, styles.version]}>
          Xantle {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </SafeAreaView>
    </View>
  );
}

function Row({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.rowText}>{label}</Text>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  disabled,
  onValueChange,
  hint,
  last,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
  hint?: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowText}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.hairline, true: colors.blue }}
        thumbColor={colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },

  // Tabs are the back-navigation mechanism — no back button needed here
  topBar: {
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
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

  sectionLabel: { marginBottom: space.sm },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    marginBottom: space.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowLast: { borderBottomWidth: 0 },
  rowText: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  rowTextWrap: { flex: 1, gap: 2 },
  rowHint: { fontFamily: font.semibold, fontSize: 12, color: colors.textFaint },
  rowChevron: { fontFamily: font.bold, fontSize: 18, color: colors.textFaint },

  signOutBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: space.sm,
    ...shadow.card,
  },
  signOutText: { fontFamily: font.bold, fontSize: 16, color: colors.danger },

  closeAccountBtn: { paddingVertical: space.md, alignItems: 'center' },
  closeAccountText: { fontFamily: font.semibold, fontSize: 14, color: colors.textFaint },

  // Profile completion row
  completionRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingVertical: space.md, paddingHorizontal: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  completionLeft: { flex: 1, gap: 6 },
  completionTitle: { fontFamily: font.bold, fontSize: 14, color: colors.cyan },
  completionBarTrack: { height: 4, backgroundColor: colors.hairline, borderRadius: 2 },
  completionBarFill:  { height: 4, backgroundColor: colors.cyan, borderRadius: 2 },
  completionHint:  { fontFamily: font.semibold, fontSize: 11, color: colors.textMuted },
  completionArrow: { fontFamily: font.bold, fontSize: 22, color: colors.cyan },

  version: { marginTop: 'auto', alignSelf: 'center', paddingBottom: space.lg },
});
