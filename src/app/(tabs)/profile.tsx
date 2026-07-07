import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../../components/GradientFill';
import { goBackOr } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { usePresence } from '../../lib/usePresence';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

const MIN_LEN = 3;
const MAX_LEN = 20;
const VALID_RE = /^[a-z0-9_]+$/;

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function Profile() {
  const router = useRouter();
  const { session, loading: sessionLoading } = useSession();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(null);

  const { isOnline } = usePresence();
  const online = !!session?.user && isOnline(session.user.id);

  type Stats = { matches: number; roundsWon: number; trophies: number; winRate: number };
  const [stats, setStats] = useState<Stats | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [saving, setSaving] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    supabase
      .from('game_players')
      .select('score, trophies')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        if (!active || !data) return;
        const matches = data.length;
        const roundsWon = data.reduce((s, r) => s + (r.score ?? 0), 0);
        const trophies = data.reduce((s, r) => s + (r.trophies ?? 0), 0);
        const winRate = matches > 0 ? Math.round((trophies / matches) * 100) : 0;
        setStats({ matches, roundsWon, trophies, winRate });
      });
    return () => { active = false; };
  }, [session?.user?.id]);

  const startEditing = () => {
    setDraft(username ?? '');
    setCheckState('idle');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  };

  const handleChange = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    setDraft(trimmed);

    if (trimmed === username) {
      setCheckState('idle');
      return;
    }
    if (trimmed.length < MIN_LEN) {
      setCheckState('idle');
      return;
    }
    if (trimmed.length > MAX_LEN || !VALID_RE.test(trimmed)) {
      setCheckState('invalid');
      return;
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setCheckState('checking');
    debounceTimer.current = setTimeout(() => checkAvailability(trimmed), 600);
  };

  const checkAvailability = async (value: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', value)
      .maybeSingle();

    if (error) {
      setCheckState('idle');
      return;
    }
    setCheckState(data ? 'taken' : 'available');
  };

  const handleSave = async () => {
    if (checkState !== 'available' || !session?.user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({ username: draft })
      .eq('id', session.user.id);

    setSaving(false);
    if (error) {
      if (error.code === '23505') {
        setCheckState('taken');
      } else {
        setErrorMsg(error.message);
      }
      return;
    }

    setUsername(draft);
    setEditing(false);
  };

  const statusConfig: Record<CheckState, { text: string; color: string } | null> = {
    idle: null,
    checking: { text: 'Checking availability…', color: colors.textMuted },
    available: { text: '✓ Available', color: colors.success },
    taken: { text: '✗ Already taken', color: colors.danger },
    invalid: {
      text: `Letters, numbers and _ only · ${MIN_LEN}–${MAX_LEN} chars`,
      color: colors.warning,
    },
  };
  const status = statusConfig[checkState];
  const saveEnabled = checkState === 'available' && !saving;

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => goBackOr(router, '/home')}
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
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            <View style={styles.avatar}>
              <GradientFill colors={gradients.featured} />
              <Text style={styles.avatarLetter}>{(username ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={[styles.statusBadge, online ? styles.statusOnline : styles.statusOffline]}>
              <View style={[styles.statusDot, { backgroundColor: online ? colors.success : colors.textMuted }]} />
              <Text style={[styles.statusText, { color: online ? colors.success : colors.textMuted }]}>
                {online ? 'Online' : 'Offline'}
              </Text>
            </View>
            {editing ? (
              <View style={styles.editWrap}>
                <View
                  style={[
                    styles.inputWrap,
                    checkState === 'available' && styles.inputBorderGreen,
                    checkState === 'taken' && styles.inputBorderRed,
                  ]}
                >
                  <Text style={styles.atSign}>@</Text>
                  <TextInput
                    style={styles.input}
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={MAX_LEN}
                    value={draft}
                    onChangeText={handleChange}
                  />
                  {checkState === 'checking' && (
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  )}
                </View>
                {status && <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>}
                <View style={styles.editActions}>
                  <Pressable
                    style={({ pressed }) => [styles.editActionBtn, pressed && styles.pressed]}
                    onPress={cancelEditing}
                  >
                    <Text style={styles.editActionTextMuted}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.editActionBtn,
                      !saveEnabled && styles.ctaDisabled,
                      pressed && saveEnabled && styles.pressed,
                    ]}
                    onPress={handleSave}
                    disabled={!saveEnabled}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.blue} />
                    ) : (
                      <Text style={[styles.editActionText, !saveEnabled && styles.editActionTextMuted]}>
                        Save
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.usernameRow} onPress={startEditing}>
                <Text style={[themeText.h1, styles.username]}>{username}</Text>
                <Text style={styles.editGlyph}>✎</Text>
              </Pressable>
            )}
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

            <Text style={[themeText.label, styles.statsLabel]}>GAME STATS</Text>
            {stats ? (
              <View style={styles.statsGrid}>
                <StatCard emoji="🏆" value={stats.trophies} label="Trophies" accent={colors.warning} />
                <StatCard emoji="🎮" value={stats.matches} label="Matches" />
                <StatCard emoji="⚡" value={stats.roundsWon} label="Rounds won" accent={colors.blue} />
                <StatCard emoji="🎯" value={`${stats.winRate}%`} label="Win rate" accent={colors.success} />
              </View>
            ) : (
              <View style={styles.statsGrid}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={[styles.statCard, styles.statCardSkeleton]} />
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function StatCard({
  emoji,
  value,
  label,
  accent,
}: {
  emoji: string;
  value: number | string;
  label: string;
  accent?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : undefined]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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

  content: { alignItems: 'center', paddingTop: space.md, paddingBottom: space.xl },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
    ...shadow.blueGlow,
  },
  avatarLetter: { fontFamily: font.extrabold, fontSize: 38, color: colors.white },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: space.md,
  },
  statusOnline: { backgroundColor: 'rgba(74,222,128,0.12)' },
  statusOffline: { backgroundColor: 'rgba(147,155,167,0.10)' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  username: { marginBottom: space.xs },
  email: { marginBottom: space.xl },

  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs },
  editGlyph: { color: colors.textFaint, fontSize: 16 },

  editWrap: { alignSelf: 'stretch', gap: space.sm, marginBottom: space.xl },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    paddingHorizontal: space.md,
    ...shadow.card,
  },
  inputBorderGreen: { borderColor: colors.success },
  inputBorderRed: { borderColor: colors.danger },
  atSign: { fontFamily: font.extrabold, fontSize: 18, color: colors.textFaint, marginRight: space.xs },
  input: { flex: 1, fontFamily: font.semibold, fontSize: 18, color: colors.text, paddingVertical: space.md },
  statusText: { fontFamily: font.semibold, fontSize: 13 },

  editActions: { flexDirection: 'row', justifyContent: 'center', gap: space.lg },
  editActionBtn: { paddingVertical: space.sm, paddingHorizontal: space.md },
  editActionText: { fontFamily: font.bold, fontSize: 15, color: colors.blue },
  editActionTextMuted: { fontFamily: font.bold, fontSize: 15, color: colors.textFaint },
  ctaDisabled: { opacity: 0.5 },

  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    gap: space.xs,
    ...shadow.card,
  },
  cardValue: { color: colors.text },

  statsLabel: { alignSelf: 'stretch', marginTop: space.lg, marginBottom: space.sm },
  statsGrid: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.lg,
    alignItems: 'center',
    gap: space.xs,
    ...shadow.card,
  },
  statCardSkeleton: { height: 96, opacity: 0.4 },
  statEmoji: { fontSize: 26 },
  statValue: {
    fontFamily: font.black,
    fontSize: 28,
    color: colors.text,
    lineHeight: 32,
  },
  statLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
