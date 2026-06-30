import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../../components/GradientFill';
import { colors, font, gradients, space } from '../../theme';

/**
 * Games tab — placeholder for the full game catalogue browser.
 * Individual game screens (pixel-rush, setup, etc.) remain in their
 * own stack routes and are navigated to from this screen and home.tsx.
 */
export default function GamesTab() {
  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Games</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.emoji}>🎮</Text>
          <Text style={styles.heading}>Game Catalogue</Text>
          <Text style={styles.sub}>Browse all available games.{'\n'}Coming soon.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  topBar: { paddingTop: space.sm, paddingBottom: space.lg },
  title: { fontFamily: font.black, fontSize: 28, color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emoji: { fontSize: 56, marginBottom: space.sm },
  heading: { fontFamily: font.black, fontSize: 22, color: colors.text },
  sub: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
