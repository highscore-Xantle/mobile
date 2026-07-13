/**
 * CommentSheet — bottom sheet for viewing and posting comments on a Win post.
 *
 * Implemented as a React Native Modal (no extra native dependencies) since
 * the project does not include @gorhom/bottom-sheet. Uses react-native-reanimated
 * for the slide-in entrance, already in use throughout the app.
 *
 * Features:
 *   • Keyboard-aware layout (KeyboardAvoidingView)
 *   • Top-level comments + one level of replies
 *   • Optimistic posting via useComments.addComment
 *   • Loading, empty, and error states
 *   • "Reply to" affordance that pre-fills the input with a @mention
 */
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Avatar } from './ui/Avatar';
import { GradientFill } from './GradientFill';
import { colors, font, radius, shadow, space } from '../theme';
import { useComments } from '../lib/useComments';
import type { Comment, Reply } from '../lib/useComments';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── ReplyItem ────────────────────────────────────────────────────────────────

interface ReplyItemProps {
  reply: Reply;
}

function ReplyItem({ reply }: ReplyItemProps) {
  const letter = (reply.author.username ?? reply.user_id)?.[0] ?? '?';
  return (
    <View style={styles.replyRow}>
      <View style={styles.replyLine} />
      <Avatar letter={letter} imageUrl={reply.author.avatar_url} size={28} />
      <View style={styles.replyBubble}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentUsername}>@{reply.author.username ?? 'user'}</Text>
          <Text style={styles.commentTime}>{relativeTime(reply.created_at)}</Text>
        </View>
        <Text style={styles.commentBody}>{reply.body}</Text>
      </View>
    </View>
  );
}

// ─── CommentItem ──────────────────────────────────────────────────────────────

interface CommentItemProps {
  comment: Comment;
  onReply: (comment: Comment) => void;
}

function CommentItem({ comment, onReply }: CommentItemProps) {
  const letter = (comment.author.username ?? comment.user_id)?.[0] ?? '?';

  return (
    <View style={styles.commentBlock}>
      {/* Root comment */}
      <View style={styles.commentRow}>
        <Avatar letter={letter} imageUrl={comment.author.avatar_url} size={34} />
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentUsername}>@{comment.author.username ?? 'user'}</Text>
            <Text style={styles.commentTime}>{relativeTime(comment.created_at)}</Text>
          </View>
          <Text style={styles.commentBody}>{comment.body}</Text>
          <Pressable
            style={styles.replyBtn}
            onPress={() => {
              Haptics.selectionAsync();
              onReply(comment);
            }}
            accessibilityLabel={`Reply to ${comment.author.username ?? 'user'}`}
            accessibilityRole="button"
          >
            <Text style={styles.replyBtnText}>Reply</Text>
          </Pressable>
        </View>
      </View>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <View style={styles.replies}>
          {comment.replies.map((r) => (
            <ReplyItem key={r.id} reply={r} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── CommentSheet ─────────────────────────────────────────────────────────────

export interface CommentSheetProps {
  postId: string | null;
  visible: boolean;
  currentUserId: string;
  currentUsername: string | null;
  currentAvatarUrl: string | null;
  onClose: () => void;
}

export function CommentSheet({
  postId,
  visible,
  currentUserId,
  currentUsername,
  currentAvatarUrl,
  onClose,
}: CommentSheetProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { comments, loading, submitting, error, addComment } = useComments(
    visible ? postId : null,
  );

  // ── Reply affordance ─────────────────────────────────────────────────────────
  const handleSetReply = useCallback((comment: Comment) => {
    setReplyTarget(comment);
    setText(`@${comment.author.username ?? 'user'} `);
    inputRef.current?.focus();
  }, []);

  const clearReply = useCallback(() => {
    setReplyTarget(null);
    setText('');
  }, []);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSubmitError(null);
    const parentId = replyTarget?.id ?? null;
    clearReply();
    // addComment's own `error` state only ever surfaces via the empty-list
    // view, so a post that already has comments showed zero feedback on a
    // failed submit — the comment just silently vanished. Check the return
    // value directly instead and show it regardless of list length.
    const err = await addComment(trimmed, parentId, currentUserId, currentUsername, currentAvatarUrl);
    if (err) setSubmitError(err);
  }, [text, submitting, replyTarget, addComment, currentUserId, currentUsername, currentAvatarUrl, clearReply]);

  // ── Empty / error states ─────────────────────────────────────────────────────
  const renderEmpty = () => {
    if (loading) return null;
    if (error) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.emptyTitle}>Couldn't load comments</Text>
          <Text style={styles.emptySub}>{error}</Text>
        </View>
      );
    }
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorEmoji}>💬</Text>
        <Text style={styles.emptyTitle}>No comments yet</Text>
        <Text style={styles.emptySub}>Be the first to say something.</Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Scrim */}
      <Pressable style={styles.scrim} onPress={onClose} />

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior="padding"
        style={styles.kvWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          entering={SlideInDown.duration(250)}
          style={[styles.sheet, { paddingBottom: insets.bottom + space.sm }]}
        >
          <GradientFill colors={['#1E2435', colors.bg]} />

          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Comments</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Close comments"
              accessibilityRole="button"
            >
              <FontAwesome name="times" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Comment list */}
          {loading ? (
            <ActivityIndicator
              color={colors.blue}
              style={{ marginVertical: space.xl }}
              accessibilityLabel="Loading comments"
            />
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <CommentItem comment={item} onReply={handleSetReply} />
              )}
              ListEmptyComponent={renderEmpty}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* Submit-error banner — shown regardless of list length */}
          {submitError && (
            <View style={styles.submitErrorBanner}>
              <Text style={styles.submitErrorText}>{submitError}</Text>
              <Pressable onPress={() => setSubmitError(null)} accessibilityLabel="Dismiss error">
                <FontAwesome name="times-circle" size={16} color={colors.danger} />
              </Pressable>
            </View>
          )}

          {/* Reply banner */}
          {replyTarget && (
            <View style={styles.replyBanner}>
              <Text style={styles.replyBannerText}>
                Replying to{' '}
                <Text style={styles.replyBannerName}>
                  @{replyTarget.author.username ?? 'user'}
                </Text>
              </Text>
              <Pressable onPress={clearReply} accessibilityLabel="Cancel reply">
                <FontAwesome name="times-circle" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          )}

          {/* Input row */}
          <View style={styles.inputRow}>
            <Avatar
              letter={(currentUsername ?? currentUserId)?.[0] ?? '?'}
              imageUrl={currentAvatarUrl}
              size={34}
            />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Add a comment…"
              placeholderTextColor={colors.textFaint}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={1000}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={handleSubmit}
              accessibilityLabel="Comment input"
            />
            <Pressable
              style={[styles.sendBtn, (!text.trim() || submitting) && styles.sendBtnDisabled]}
              onPress={handleSubmit}
              disabled={!text.trim() || submitting}
              accessibilityLabel="Send comment"
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <FontAwesome name="send" size={14} color={colors.white} />
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  kvWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderColor: colors.hairline,
    maxHeight: '80%',
    overflow: 'hidden',
    paddingHorizontal: space.lg,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairline,
    alignSelf: 'center',
    marginTop: space.md,
    marginBottom: space.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    marginBottom: space.xs,
  },
  sheetTitle: {
    fontFamily: font.black,
    fontSize: 18,
    color: colors.text,
  },
  closeBtn: {
    padding: space.xs,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List
  listContent: {
    gap: space.md,
    paddingBottom: space.md,
    flexGrow: 1,
  },

  // Comment block
  commentBlock: { gap: space.sm },
  commentRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  commentContent: { flex: 1, gap: 4 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  commentUsername: { fontFamily: font.bold, fontSize: 13, color: colors.text },
  commentTime: { fontFamily: font.semibold, fontSize: 11, color: colors.textFaint },
  commentBody: {
    fontFamily: font.regular,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  replyBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  replyBtnText: {
    fontFamily: font.bold,
    fontSize: 12,
    color: colors.blue,
  },

  // Replies
  replies: { paddingLeft: 34 + space.sm, gap: space.sm },
  replyRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  replyLine: {
    position: 'absolute',
    left: -space.sm - 14,
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: colors.hairline,
  },
  replyBubble: { flex: 1, gap: 4 },

  // Empty / error
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xl,
    gap: space.sm,
  },
  errorEmoji: { fontSize: 36 },
  emptyTitle: { fontFamily: font.black, fontSize: 15, color: colors.text },
  emptySub: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },

  // Reply banner
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginBottom: space.xs,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  replyBannerText: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted },
  replyBannerName: { fontFamily: font.bold, color: colors.blue },

  // Submit-error banner
  submitErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginBottom: space.xs,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
  },
  submitErrorText: { flex: 1, fontFamily: font.semibold, fontSize: 12, color: colors.danger },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontFamily: font.semibold,
    fontSize: 14,
    color: colors.text,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.blueGlow,
  },
  sendBtnDisabled: { opacity: 0.4 },
});
