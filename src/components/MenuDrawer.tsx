import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { GradientFill } from './GradientFill';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

const PANEL_WIDTH = '78%';

/**
 * MenuDrawer — B2-style primitive. Self-contained: reads the session and
 * profile username itself, so dropping it into a screen's top bar only
 * needs `visible` / `onClose`.
 */
export function MenuDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { session } = useSession();
  const open = useSharedValue(0);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    open.value = withTiming(visible ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [visible]);

  useEffect(() => {
    if (!visible || !session?.user) return;
    supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setUsername(data?.username ?? null));
  }, [visible, session?.user?.id]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - open.value) * 320 }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: open.value * 0.6,
  }));

  const go = (path: '/profile' | '/settings') => {
    onClose();
    router.push(path);
  };

  const signOut = async () => {
    onClose();
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const displayName = username ?? session?.user?.email ?? 'Player';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.panel, panelStyle]}>
          <GradientFill colors={gradients.background} />
          <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
              <View style={styles.avatar}>
                <GradientFill colors={gradients.featured} />
                <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={[themeText.title, styles.username]} numberOfLines={1}>
                {displayName}
              </Text>
            </View>

            <View style={styles.nav}>
              <MenuRow label="Profile" onPress={() => go('/profile')} />
              <MenuRow label="Settings" onPress={() => go('/settings')} />
            </View>

            <View style={styles.footer}>
              <Pressable
                style={({ pressed }) => [styles.signOutRow, pressed && styles.pressed]}
                onPress={signOut}
              >
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress}>
      <Text style={styles.rowText}>{label}</Text>
      <Text style={styles.rowChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  backdrop: { backgroundColor: '#000000' },

  panel: {
    width: PANEL_WIDTH,
    height: '100%',
    marginLeft: 'auto',
    overflow: 'hidden',
    ...shadow.card,
  },
  safe: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.lg },

  header: { alignItems: 'center', marginBottom: space.xl },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  avatarLetter: { fontFamily: font.extrabold, fontSize: 26, color: colors.white },
  username: { color: colors.text },

  nav: { gap: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  rowText: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  rowChevron: { fontFamily: font.bold, fontSize: 18, color: colors.textFaint },

  footer: { marginTop: 'auto', paddingBottom: space.lg, borderTopWidth: 1, borderTopColor: colors.hairline },
  signOutRow: { paddingVertical: space.md, paddingHorizontal: space.sm, marginTop: space.sm, borderRadius: radius.sm },
  signOutText: { fontFamily: font.bold, fontSize: 16, color: colors.danger },

  pressed: { backgroundColor: colors.hairline },
});
