/**
 * ProfileCompletionBanner — dismissible top-of-feed banner.
 *
 * Shown on the Home screen when a profile is incomplete.
 * Dismissed state is persisted via AsyncStorage and resets
 * automatically when a new field is completed.
 *
 * Does NOT gate access — purely informational/motivational.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { colors, font, radius, space } from '../theme';
import type { ProfileCompletion } from '../lib/useProfileCompletion';

const DISMISSED_KEY = 'xantle:profile_banner_v1_dismissed';

interface Props {
  completion: ProfileCompletion;
}

export function ProfileCompletionBanner({ completion }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  // Load dismissed state once
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((val) => setDismissed(val === 'true'));
  }, []);

  // If profile just became complete, clear the dismissed flag so the banner
  // won't re-appear if the user ever loses a field (edge case).
  useEffect(() => {
    if (completion.isComplete) {
      AsyncStorage.removeItem(DISMISSED_KEY);
    }
  }, [completion.isComplete]);

  const handleDismiss = () => {
    AsyncStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  const handleComplete = () => {
    router.push('/onboarding' as any);
  };

  // Hide if complete, still loading, or dismissed
  if (completion.isComplete || completion.loading || dismissed) return null;

  const { completionPercent, missingFields } = completion;
  const fieldLabel = missingFields[0] === 'avatar_url'
    ? 'profile photo'
    : missingFields[0] === 'country'
    ? 'country'
    : 'username';

  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOutUp.duration(200)}>
      <View style={styles.banner}>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${completionPercent}%` as any }]} />
        </View>

        <View style={styles.row}>
          {/* Icon */}
          <View style={styles.iconWrap}>
            <FontAwesome name="user-circle" size={22} color={colors.cyan} />
          </View>

          {/* Text */}
          <View style={styles.textWrap}>
            <Text style={styles.title}>Complete your profile</Text>
            <Text style={styles.sub} numberOfLines={1}>
              Add your {fieldLabel} · {completionPercent}% done
            </Text>
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={handleComplete}
            accessibilityLabel="Complete your profile"
            accessibilityRole="button"
          >
            <Text style={styles.ctaText}>Finish</Text>
          </Pressable>

          {/* Dismiss */}
          <Pressable
            style={({ pressed }) => [styles.dismiss, pressed && styles.ctaPressed]}
            onPress={handleDismiss}
            accessibilityLabel="Dismiss banner"
            accessibilityRole="button"
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <FontAwesome name="times" size={13} color={colors.textFaint} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.cyan}33`,
    overflow: 'hidden',
    marginBottom: space.sm,
  },
  progressTrack: {
    height: 3,
    backgroundColor: colors.hairline,
  },
  progressFill: {
    height: 3,
    backgroundColor: colors.cyan,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.cyan}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.text,
  },
  sub: {
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  cta: {
    backgroundColor: colors.cyan,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  ctaPressed: { opacity: 0.75 },
  ctaText: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.bg,
  },
  dismiss: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
