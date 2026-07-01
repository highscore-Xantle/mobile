import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../../components/GradientFill';
import { colors, font, gradients, space } from '../../theme';

/**
 * Notifications tab — placeholder for in-app alerts and game invites.
 * Push token registration lives in Settings; this tab surfaces the inbox.
 */
export default function NotificationsTab() {
  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Alerts</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.emoji}>🔔</Text>
          <Text style={styles.heading}>Notifications</Text>
          <Text style={styles.sub}>Game invites and alerts will appear here.{'\n'}Coming soon.</Text>
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
