import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../../components/GradientFill';
import { HeaderAvatar } from '../../components/HeaderAvatar';
import { colors, font, gradients, space } from '../../theme';

/**
 * Live tab — placeholder for the live-spectator feed.
 * This will be replaced with the full ActiveRooms list in a future sprint.
 */
export default function LiveTab() {
  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Live</Text>
          <HeaderAvatar />
        </View>
        <View style={styles.center}>
          <Text style={styles.emoji}>📡</Text>
          <Text style={styles.heading}>Live Feed</Text>
          <Text style={styles.sub}>Watch active games in real time.{'\n'}Coming soon.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.lg },
  title: { fontFamily: font.black, fontSize: 28, color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emoji: { fontSize: 56, marginBottom: space.sm },
  heading: { fontFamily: font.black, fontSize: 22, color: colors.text },
  sub: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
