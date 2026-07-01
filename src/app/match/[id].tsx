import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { GradientFill } from '../../components/GradientFill';
import { RoundScoreboard } from '../../components/RoundScoreboard';
import { colors, font, gradients, radius, shadow, space } from '../../theme';
import { goBackOr } from '../../lib/navigation';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function MatchDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMatch() {
      setLoading(true);
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
  }, [id]);

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
  const diff = match.state?.difficulty === 'hardcore' ? 'hard' : (match.state?.difficulty === 'auto' ? 'medium' : 'easy');

  const isNumberDuel = match.game_kind === 'number-duel';
  const history = match.state?.matchHistory || [];

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
