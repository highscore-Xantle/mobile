// Custom animated bottom navigation (Home · Live · Settings · Profile).
//
// A floating dark pill bar. The active tab expands into a blue pill with its
// label; the others collapse to icons. Switching tabs reflows via reanimated
// layout animations (the pill slides/resizes) and the label fades in — smooth,
// not snappy. Profile shows the user's avatar photo instead of an icon.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { useAccent } from '../lib/accent';
import { colors, font, shadow, space } from '../theme';

type FAIcon = React.ComponentProps<typeof FontAwesome>['name'];

// The tabs shown in the bar, in order. Other (tabs) routes (games,
// notifications) stay navigable but aren't shown here.
const TABS: { name: string; label: string; icon: FAIcon }[] = [
  { name: 'home', label: 'Home', icon: 'home' },
  { name: 'live', label: 'Live', icon: 'rss' },
  { name: 'settings', label: 'Settings', icon: 'cog' },
  { name: 'profile', label: 'Profile', icon: 'user' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { accent } = useAccent();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    // Reset on user change first — otherwise the previous account's photo
    // stays on screen (looks like an identity leak) until/unless the new
    // fetch happens to resolve with a truthy value.
    setAvatarUrl(null);
    if (!session?.user) return;
    let active = true;
    supabase
      .from('profiles').select('avatar_url').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => { if (active) setAvatarUrl(data?.avatar_url ?? null); });
    return () => { active = false; };
  }, [session?.user?.id]);

  const activeName = state.routes[state.index]?.name;

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom || space.md }]}>
      <View style={styles.bar}>
        {TABS.map((t) => {
          const route = state.routes.find((r) => r.name === t.name);
          if (!route) return null;
          const focused = activeName === t.name;
          const isProfile = t.name === 'profile';

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never);
          };

          return (
            <AnimatedPressable
              key={t.name}
              onPress={onPress}
              layout={LinearTransition.springify().damping(20).stiffness(180)}
              style={[styles.item, focused && styles.itemActive, focused && { backgroundColor: accent.accent }]}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t.label}
            >
              {isProfile && avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={[styles.avatar, focused && styles.avatarActive]}
                  contentFit="cover"
                />
              ) : (
                <FontAwesome name={t.icon} size={19} color={focused ? colors.white : colors.textFaint} />
              )}
              {focused && (
                <Animated.Text
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(120)}
                  style={styles.label}
                >
                  {t.label}
                </Animated.Text>
              )}
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: space.sm, backgroundColor: 'transparent' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: colors.surface,
    borderRadius: 30,
    paddingHorizontal: space.sm,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 22,
  },
  itemActive: { backgroundColor: colors.blue, paddingHorizontal: 16, ...shadow.blueGlow },
  label: { fontFamily: font.bold, fontSize: 13, color: colors.white, letterSpacing: 0.2 },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceAlt },
  avatarActive: { borderWidth: 1.5, borderColor: colors.white },
});
