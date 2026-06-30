import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { colors, font, shadow } from '../theme';

interface Props {
  showOnlineDot?: boolean;
}

export function HeaderAvatar({ showOnlineDot = false }: Props) {
  const router = useRouter();
  const { session } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const initial = (
    (session?.user?.user_metadata?.username as string)?.[0] ??
    session?.user?.email?.[0] ??
    '?'
  ).toUpperCase();

  useEffect(() => {
    if (!session?.user?.id) return;
    let active = true;
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data?.avatar_url) setAvatarUrl(data.avatar_url);
      });
    return () => { active = false; };
  }, [session?.user?.id]);

  return (
    <Pressable
      style={({ pressed }) => [styles.outer, pressed && styles.pressed]}
      onPress={() => router.push('/profile')}
    >
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={styles.inner}>
          <Text style={styles.initial}>{initial}</Text>
        </View>
      )}
      {showOnlineDot && <View style={styles.onlineDot} />}
    </Pressable>
  );
}

const SIZE = 40;
const INNER = 36;

const styles = StyleSheet.create({
  outer: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.blueGlow,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.95 }] },
  inner: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
  },
  initial: {
    fontFamily: font.extrabold,
    fontSize: 15,
    color: colors.blue,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
