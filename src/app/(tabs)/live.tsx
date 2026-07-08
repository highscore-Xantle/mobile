import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import { LiveDot } from '../../components/Feed/LiveStrip';
import { fetchLiveMatches, viewerRouteFor, type LiveMatch } from '../../lib/useLiveMatches';
import { colors, font, gradients, radius, shadow, space } from '../../theme';
import { GAMES } from './games';

const POLL_MS = 10_000;

function gameMeta(gameKind: string) {
  return GAMES.find((g) => g.id === gameKind) ?? { title: gameKind, emoji: '🎮' };
}

export default function LiveTab() {
  const router = useRouter();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const m = await fetchLiveMatches();
    setMatches(m);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const handleWatch = (match: LiveMatch) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/game/[id]',
      params: { id: viewerRouteFor(match.gameKind), roomCode: match.code },
    });
  };

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Live</Text>
            {matches.length > 0 && (
              <View style={styles.countPill}>
                <LiveDot color={colors.danger} />
                <Text style={styles.countText}>{matches.length}</Text>
              </View>
            )}
          </View>
          <HeaderAvatar />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.blue} />
          </View>
        ) : matches.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>📡</Text>
            <Text style={styles.heading}>No live matches right now</Text>
            <Text style={styles.sub}>Check back once someone's mid-game — you'll{'\n'}be able to watch and drop reactions in real time.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {matches.map((match, i) => {
              const meta = gameMeta(match.gameKind);
              return (
                <Animated.View key={`${match.gameKind}-${match.code}`} entering={FadeInDown.springify().damping(14).delay(i * 60)}>
                  <Pressable
                    style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                    onPress={() => handleWatch(match)}
                  >
                    <Text style={styles.cardEmoji}>{meta.emoji}</Text>
                    <View style={styles.cardBody}>
                      <View style={styles.liveRow}>
                        <LiveDot color={colors.danger} />
                        <Text style={styles.liveLabel}>LIVE</Text>
                        <Text style={styles.gameLabel}>· {meta.title}</Text>
                      </View>
                      <Text style={styles.players} numberOfLines={1}>{match.playerNames.join(' vs ')}</Text>
                      <Text style={styles.round}>Round {match.round}</Text>
                    </View>
                    <View style={styles.watchChip}>
                      <Text style={styles.watchChipText}>Watch →</Text>
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontFamily: font.black, fontSize: 28, color: colors.text },
  countPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline,
  },
  countText: { fontFamily: font.bold, fontSize: 12, color: colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingHorizontal: space.lg },
  emoji: { fontSize: 56, marginBottom: space.sm },
  heading: { fontFamily: font.black, fontSize: 20, color: colors.text, textAlign: 'center' },
  sub: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  list: { gap: space.md, paddingBottom: space.xl },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md,
    borderWidth: 1, borderColor: colors.hairline, ...shadow.card,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  cardEmoji: { fontSize: 28 },
  cardBody: { flex: 1, gap: 4 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveLabel: { fontFamily: font.extrabold, fontSize: 10, color: colors.danger, letterSpacing: 1 },
  gameLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textFaint },
  players: { fontFamily: font.black, fontSize: 15, color: colors.text },
  round: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted },
  watchChip: {
    backgroundColor: 'rgba(46,126,240,0.12)', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(46,126,240,0.25)',
  },
  watchChipText: { fontFamily: font.bold, fontSize: 12, color: colors.blue },
});
