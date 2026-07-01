/**
 * WinCard — primary social post card for the Wins Feed.
 *
 * Renders a single post with:
 *   • AuthorHeader  — avatar, username, game badge, relative timestamp
 *   • Body          — result text + optional media (expo-image)
 *   • ActionBar     — Like, Comment, Share, Play This Game
 *
 * Key design decisions:
 *   • Wrapped in React.memo — list re-renders don't propagate to unchanged cards.
 *   • Like animation runs on the UI thread via Reanimated (no JS bridge drop).
 *   • Double-tap region is the full card body (as in Instagram).
 *   • All values from theme.ts — no hardcoded colours.
 */
import { memo, useCallback, useRef } from 'react';
import {
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { Avatar } from '../ui/Avatar';
import { colors, font, radius, shadow, space } from '../../theme';
import type { WinPost } from '../../lib/useWinsFeed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format ISO timestamp as a friendly relative label. */
function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const GAME_BADGE_MAP: Record<string, { label: string; color: string }> = {
  'number-duel': { label: 'NUMBER DUEL', color: colors.royal },
  'pixel-rush': { label: 'PIXEL RUSH', color: colors.blue },
};

function gameBadge(gameType: string) {
  return (
    GAME_BADGE_MAP[gameType] ?? { label: gameType.toUpperCase(), color: colors.textFaint }
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AuthorHeaderProps {
  post: WinPost;
  onAvatarPress: () => void;
}

const AuthorHeader = memo(function AuthorHeader({ post, onAvatarPress }: AuthorHeaderProps) {
  const letter = (post.author.username ?? post.user_id)?.[0] ?? '?';
  const badge = gameBadge(post.game_type);

  return (
    <View style={styles.authorRow}>
      <Pressable
        onPress={onAvatarPress}
        accessibilityLabel={`View ${post.author.username ?? 'user'} profile`}
        accessibilityRole="button"
      >
        <Avatar letter={letter} imageUrl={post.author.avatar_url} size={38} />
      </Pressable>

      <View style={styles.authorMeta}>
        <Text style={styles.authorName} numberOfLines={1}>
          @{post.author.username ?? 'unknown'}
        </Text>
        <View style={styles.authorSubRow}>
          <View style={[styles.gameBadge, { backgroundColor: badge.color + '22' }]}>
            <Text style={[styles.gameBadgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
          <Text style={styles.timestamp}>{relativeTime(post.created_at)}</Text>
        </View>
      </View>
    </View>
  );
});

// ─── Heart overlay for double-tap ────────────────────────────────────────────

function HeartOverlay({ sharedScale }: { sharedScale: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: sharedScale.value }],
    opacity: sharedScale.value, // Fades out smoothly as it shrinks
  }));
  return (
    <Animated.View style={[styles.heartOverlay, style]} pointerEvents="none">
      <FontAwesome name="heart" size={72} color={colors.danger} />
    </Animated.View>
  );
}

// ─── WinCard ─────────────────────────────────────────────────────────────────

export interface WinCardProps {
  post: WinPost;
  onLike: (postId: string) => Promise<string | null>;
  onComment: (postId: string) => void;
}

export const WinCard = memo(function WinCard({ post, onLike, onComment }: WinCardProps) {
  const router = useRouter();
  const heartScale = useSharedValue(0);
  // Guard duplicate rapid-fire like taps.
  const likingRef = useRef(false);

  // ── Like logic ──────────────────────────────────────────────────────────────
  const triggerLike = useCallback(async () => {
    if (likingRef.current) return;
    likingRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await onLike(post.id);
    likingRef.current = false;
  }, [onLike, post.id]);

  const animateHeart = useCallback(() => {
    'worklet';
    // Strictly timed 500ms total (150ms pop in, 200ms hold, 150ms shrink/fade).
    // Avoiding withSpring because physics calculations can elongate the time.
    heartScale.value = withSequence(
      withTiming(1, { duration: 150 }),
      withTiming(1, { duration: 200 }),
      withTiming(0, { duration: 150 }),
    );
  }, [heartScale]);

  const handlePlayGame = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (post.game_type === 'pixel-rush') {
      router.push('/games/pixel-rush' as any);
    } else {
      router.push(`/setup/${post.game_type}` as any);
    }
  };

  // ── Double-tap gesture ──────────────────────────────────────────────────────
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      if (!post.viewer_has_liked) {
        animateHeart();
      }
      runOnJS(triggerLike)();
    });

  // ── Navigate to profile ──────────────────────────────────────────────────────
  const handleAvatarPress = useCallback(() => {
    Haptics.selectionAsync();
    router.push('/profile');
  }, [router]);

  // ── Navigate to game details ─────────────────────────────────────────────────
  const handlePlayPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (post.match_id) {
      // Cast required until Expo Router regenerates its typed routes map after prebuild.
      router.push({ pathname: '/match/[id]' as any, params: { id: post.match_id } });
    }
  }, [router, post.match_id]);

  // ── Share ────────────────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    Haptics.selectionAsync();
    Share.share({
      message: `Check out this win on Xantle! "${post.result_text}"`,
    });
  }, [post.result_text]);

  // ── Comment ──────────────────────────────────────────────────────────────────
  const handleComment = useCallback(() => {
    Haptics.selectionAsync();
    onComment(post.id);
  }, [onComment, post.id]);

  return (
    <View style={styles.card}>
      <AuthorHeader post={post} onAvatarPress={handleAvatarPress} />

      {/* Body — double-tap area */}
      <GestureDetector gesture={doubleTap}>
        <View style={styles.body}>
          <Text style={styles.resultText}>{post.result_text}</Text>

          {post.media_url && (
            <View style={styles.mediaWrap}>
              <Image
                source={{ uri: post.media_url }}
                style={styles.media}
                contentFit="cover"
                transition={300}
                accessibilityLabel="Win post image"
              />
            </View>
          )}
        </View>
      </GestureDetector>

      {/* Heart overlay spans the full card so it always centres correctly */}
      <HeartOverlay sharedScale={heartScale} />

      {/* Action bar */}
      <View style={styles.actionBar}>
        {/* Like */}
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={triggerLike}
          accessibilityLabel={post.viewer_has_liked ? 'Unlike' : 'Like'}
          accessibilityRole="button"
        >
          <FontAwesome
            name={post.viewer_has_liked ? 'heart' : 'heart-o'}
            size={18}
            color={post.viewer_has_liked ? colors.danger : colors.textMuted}
          />
          {post.like_count > 0 && (
            <Text style={[styles.actionCount, post.viewer_has_liked && styles.actionCountActive]}>
              {post.like_count}
            </Text>
          )}
        </Pressable>

        {/* Comment */}
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={handleComment}
          accessibilityLabel="View comments"
          accessibilityRole="button"
        >
          <FontAwesome name="comment-o" size={18} color={colors.textMuted} />
          {post.comment_count > 0 && (
            <Text style={styles.actionCount}>{post.comment_count}</Text>
          )}
        </Pressable>

        {/* Share */}
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={handleShare}
          accessibilityLabel="Share this post"
          accessibilityRole="button"
        >
          <FontAwesome name="share" size={18} color={colors.textMuted} />
        </Pressable>

        {/* Spacer */}
        <View style={styles.actionSpacer} />

        {/* Right actions: Play & View Match */}
        <View style={styles.actionRight}>
          <Pressable
            style={({ pressed }) => [styles.playGameBtn, pressed && styles.actionBtnPressed]}
            onPress={handlePlayGame}
            accessibilityLabel={`Play ${post.game_type}`}
            accessibilityRole="button"
          >
            <FontAwesome name="gamepad" size={13} color={colors.white} />
            <Text style={styles.playGameText}>Play</Text>
          </Pressable>

          {post.match_id && (
            <Pressable
              style={({ pressed }) => [styles.viewMatchBtn, pressed && styles.actionBtnPressed]}
              onPress={handlePlayPress} // View Match handler
              accessibilityLabel="View match details"
              accessibilityRole="button"
            >
              <FontAwesome name="gamepad" size={13} color={colors.blue} />
              <Text style={styles.viewMatchText}>View</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },

  // Author row
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    paddingBottom: space.xs,
  },
  authorMeta: { flex: 1, gap: 4 },
  authorName: {
    fontFamily: font.bold,
    fontSize: 14,
    color: colors.text,
  },
  authorSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  gameBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  gameBadgeText: {
    fontFamily: font.extrabold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  timestamp: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: colors.textFaint,
  },

  // Body
  body: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  resultText: {
    fontFamily: font.bold,
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  mediaWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  media: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  heartOverlay: {
    // Absolute relative to the card (overflow:hidden clips it cleanly).
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionBtnPressed: { opacity: 0.7, backgroundColor: 'rgba(255,255,255,0.05)' },
  actionCount: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.textMuted,
  },
  actionCountActive: { color: colors.danger },
  actionSpacer: { flex: 1 },
  actionRight: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  
  // Play Game Button (Primary)
  playGameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.blue,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    minHeight: 34,
  },
  playGameText: { fontFamily: font.bold, fontSize: 12, color: colors.white },

  // View Match Button (Original)
  viewMatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(59,157,231,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(59,157,231,0.25)',
    minHeight: 36,
  },
  viewMatchText: { fontFamily: font.bold, fontSize: 12, color: colors.blue },
});
