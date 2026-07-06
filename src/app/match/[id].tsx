import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { GradientFill } from '../../components/GradientFill';
import { RoundScoreboard } from '../../components/RoundScoreboard';
import { gridForRound } from '../../lib/usePixelGame';
import { colors, font, gradients, radius, shadow, space } from '../../theme';
import { goBackOr } from '../../lib/navigation';
import Animated, { FadeInDown } from 'react-native-reanimated';

// Normalizes a Pixel Rush `games` row into the same shape the rest of this
// screen expects from a Number Duel `rooms` row, so the scoreboard/JSX below
// doesn't need to branch beyond the round-breakdown section.
function normalizePixelRushMatch(data: any) {
  const players = (data.game_players ?? []).map((p: any) => ({
    user_id: p.user_id,
    display_name: p.guest_name,
    is_host: p.is_host,
    score: p.score,
    profiles: { username: p.profile?.username ?? null },
  }));
  const rounds = [...(data.game_rounds ?? [])].sort((a: any, b: any) => a.round_no - b.round_no);
  return {
    game_kind: 'pixel_rush',
    room_players: players,
    state: { rounds: data.rounds_total, round: data.current_round },
    pixelRounds: rounds,
  };
}

export default function MatchDetails() {
  const router = useRouter();
  const { id, gameType } = useLocalSearchParams<{ id: string; gameType?: string }>();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMatch() {
      setLoading(true);

      if (gameType === 'pixel_rush') {
        const { data, error: dbError } = await supabase
          .from('games')
          .select(`
            *,
            game_players ( user_id, guest_name, is_host, is_bot, score, profile:user_id ( username ) ),
            game_rounds ( round_no, winner_player, winner_is_bot, winner_time_ms, status )
          `)
          .eq('id', id)
          .single();

        if (dbError) {
          console.error('Match fetch error:', dbError);
          setError(`Failed to load match details. ${dbError.message || JSON.stringify(dbError)}`);
        } else if (data) {
          setMatch(normalizePixelRushMatch(data));
        }
        setLoading(false);
        return;
      }

      const { data, error: dbError } = await supabase
        .from('rooms')
        .select(`
          *,
          room_players (
            user_id,
            display_name,
            is_host,
            score,
            profiles ( username )
          )
        `)
        .eq('id', id)
        .single();

      if (dbError) {
        console.error('Match fetch error:', dbError);
        setError(`Failed to load match details. ${dbError.message || JSON.stringify(dbError)}`);
      } else if (data) {
        setMatch(data);
      }
      setLoading(false);
    }
    if (id) fetchMatch();
  }, [id, gameType]);

  if (loading) {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={styles.safe}>
          <Header router={router} />
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.blue} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (error || !match) {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={styles.safe}>
          <Header router={router} />
          <View style={styles.center}>
            <FontAwesome name="exclamation-circle" size={48} color={colors.danger} />
            <Text style={styles.errorText}>{error || 'Match not found.'}</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const hostPlayer = match.room_players?.find((p: any) => p.is_host);
  const guestPlayer = match.room_players?.find((p: any) => !p.is_host);
  const nameA = hostPlayer?.display_name || hostPlayer?.profiles?.username || 'Host';
  const nameB = guestPlayer?.display_name || guestPlayer?.profiles?.username || 'Guest';

  // We fall back to 0 if the state doesn't have it (e.g. older matches without state saving correctly yet)
  const scoreA = match.state?.hostScore ?? hostPlayer?.score ?? 0;
  const scoreB = match.state?.guestScore ?? guestPlayer?.score ?? 0;
  const totalRounds = match.state?.rounds ?? 12;
  const round = match.state?.round ?? 1;

  const isNumberDuel = match.game_kind === 'number-duel';
  const isPixelRush = match.game_kind === 'pixel_rush';
  const history = match.state?.matchHistory || [];
  const pixelHistory: any[] = match.pixelRounds || [];
  const diff = isPixelRush
    ? (gridForRound(round) <= 3 ? 'easy' : gridForRound(round) >= 5 ? 'hard' : 'medium')
    : (match.state?.difficulty === 'hardcore' ? 'hard' : (match.state?.difficulty === 'auto' ? 'medium' : 'easy'));

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <Header router={router} />

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.springify().damping(15)}>
            <RoundScoreboard
              round={round}
              totalRounds={totalRounds}
              scoreA={scoreA}
              scoreB={scoreB}
              nameA={nameA}
              nameB={nameB}
              difficulty={diff}
            />
          </Animated.View>

          <Text style={styles.sectionTitle}>Round Breakdown</Text>

          {isNumberDuel ? (
            history.length > 0 ? (
              <View style={styles.historyList}>
                {history.map((r: any, i: number) => (
                  <Animated.View key={i} entering={FadeInDown.springify().damping(15).delay(i * 50)}>
                    <View style={styles.historyCard}>
                      <View style={styles.historyHeader}>
                        <View style={styles.roundPill}>
                          <Text style={styles.roundPillText}>R{r.round}</Text>
                        </View>
                        {r.winner === 'draw' ? (
                          <Text style={styles.winnerText}>Draw (Timeout)</Text>
                        ) : (
                          <Text style={styles.winnerText}>
                            <Text style={{ color: r.winner === 'host' ? colors.cyan : colors.text }}>{r.winnerName}</Text> won
                          </Text>
                        )}
                      </View>
                      
                      <View style={styles.historyStats}>
                        <View style={styles.statBox}>
                          <Text style={styles.statLabel}>SECRET</Text>
                          <Text style={styles.statValue}>{r.secret ?? '—'}</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                          <Text style={styles.statLabel}>GUESSES</Text>
                          <Text style={styles.statValue}>{r.guesses ?? 0}</Text>
                        </View>
                      </View>
                    </View>
                  </Animated.View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <FontAwesome name="history" size={24} color={colors.textMuted} />
                <Text style={styles.emptyText}>No round history available for this match.</Text>
                <Text style={styles.emptySub}>Matches played before history tracking was added won't show breakdowns.</Text>
              </View>
            )
          ) : isPixelRush ? (
            pixelHistory.length > 0 ? (
              <View style={styles.historyList}>
                {pixelHistory.map((r: any, i: number) => {
                  const winnerRow = r.winner_is_bot
                    ? match.room_players?.find((p: any) => !p.is_host)
                    : r.winner_player
                      ? match.room_players?.find((p: any) => p.user_id === r.winner_player)
                      : null;
                  const winnerName = winnerRow?.display_name || winnerRow?.profiles?.username || null;
                  return (
                    <Animated.View key={r.round_no} entering={FadeInDown.springify().damping(15).delay(i * 50)}>
                      <View style={styles.historyCard}>
                        <View style={styles.historyHeader}>
                          <View style={styles.roundPill}>
                            <Text style={styles.roundPillText}>R{r.round_no}</Text>
                          </View>
                          {winnerName ? (
                            <Text style={styles.winnerText}>{winnerName} won</Text>
                          ) : (
                            <Text style={styles.winnerText}>No solve</Text>
                          )}
                        </View>

                        <View style={styles.historyStats}>
                          <View style={styles.statBox}>
                            <Text style={styles.statLabel}>SOLVE TIME</Text>
                            <Text style={styles.statValue}>
                              {r.winner_time_ms ? `${(r.winner_time_ms / 1000).toFixed(1)}s` : '—'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <FontAwesome name="history" size={24} color={colors.textMuted} />
                <Text style={styles.emptyText}>No round history available for this match.</Text>
              </View>
            )
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Stats for {match.game_kind} coming soon.</Text>
            </View>
          )}
          
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Header({ router }: { router: any }) {
  return (
    <View style={styles.header}>
      <Pressable
        style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        onPress={() => goBackOr(router, '/(tabs)/home')}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <FontAwesome name="chevron-left" size={16} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Match Details</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  headerTitle: {
    fontFamily: font.black,
    fontSize: 18,
    color: colors.text,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  errorText: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: colors.textMuted,
  },

  scroll: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.lg,
  },

  sectionTitle: {
    fontFamily: font.black,
    fontSize: 18,
    color: colors.text,
    marginTop: space.sm,
  },

  historyList: { gap: space.md },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.md,
    ...shadow.card,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  roundPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  roundPillText: {
    fontFamily: font.bold,
    fontSize: 11,
    color: colors.textMuted,
  },
  winnerText: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.text,
  },
  
  historyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: space.sm,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.hairline,
  },
  statLabel: {
    fontFamily: font.extrabold,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
  },
  statValue: {
    fontFamily: font.black,
    fontSize: 20,
    color: colors.blue,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: space.xl,
    alignItems: 'center',
    gap: space.sm,
  },
  emptyText: {
    fontFamily: font.bold,
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
