import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, font, radius, shadow, space } from '../theme';

type Difficulty = 'easy' | 'medium' | 'hard';

interface RoundScoreboardProps {
  round: number;
  totalRounds: number;
  scoreA: number;
  scoreB: number;
  nameA: string;
  nameB: string;
  difficulty: Difficulty;
}

const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; color: string }> = {
  easy: { label: 'EASY', color: colors.success },
  medium: { label: 'MEDIUM', color: colors.warning },
  hard: { label: 'HARD', color: colors.danger },
};

function ScoreCell({ score, name, isWinning }: { score: number; name: string; isWinning: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.25, { damping: 8, stiffness: 200 }),
      withSpring(1, { damping: 10, stiffness: 200 })
    );
  }, [score]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.scoreCell}>
      <Text style={styles.scoreName} numberOfLines={1}>{name}</Text>
      <Animated.Text style={[styles.scoreValue, isWinning && styles.scoreWinning, animStyle]}>
        {score}
      </Animated.Text>
    </View>
  );
}

export function RoundScoreboard({
  round,
  totalRounds,
  scoreA,
  scoreB,
  nameA,
  nameB,
  difficulty,
}: RoundScoreboardProps) {
  const diff = DIFFICULTY_CONFIG[difficulty];

  return (
    <View style={styles.container}>
      {/* Difficulty + Round */}
      <View style={styles.meta}>
        <View style={[styles.diffBadge, { backgroundColor: diff.color + '22', borderColor: diff.color + '55' }]}>
          <Text style={[styles.diffText, { color: diff.color }]}>{diff.label}</Text>
        </View>
        <Text style={styles.roundText}>Round {round} of {totalRounds}</Text>
        <View style={styles.diffBadge} />
      </View>

      {/* Score Row */}
      <View style={styles.scores}>
        <ScoreCell score={scoreA} name={nameA} isWinning={scoreA > scoreB} />
        <View style={styles.vs}>
          <Text style={styles.vsText}>vs</Text>
        </View>
        <ScoreCell score={scoreB} name={nameB} isWinning={scoreB > scoreA} />
      </View>

      {/* Round Progress Bar */}
      <View style={styles.progressTrack}>
        {Array.from({ length: totalRounds }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i < round - 1 && styles.progressDotDone,
              i === round - 1 && styles.progressDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.md,
    gap: space.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  diffBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 70,
    alignItems: 'center',
  },
  diffText: { fontFamily: font.extrabold, fontSize: 11, letterSpacing: 1.5 },
  roundText: { fontFamily: font.bold, fontSize: 14, color: colors.textMuted },

  scores: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scoreCell: { flex: 1, alignItems: 'center', gap: 2 },
  scoreName: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.textMuted,
    maxWidth: 100,
    textAlign: 'center',
  },
  scoreValue: {
    fontFamily: font.display,
    fontSize: 40,
    color: colors.text,
    includeFontPadding: false,
  },
  scoreWinning: { color: colors.cyan },
  vs: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: { fontFamily: font.extrabold, fontSize: 12, color: colors.textFaint },

  progressTrack: { flexDirection: 'row', gap: 4, justifyContent: 'center', paddingTop: 4 },
  progressDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
  },
  progressDotDone: { backgroundColor: colors.blue },
  progressDotActive: { backgroundColor: colors.cyan, width: 14 },
});
