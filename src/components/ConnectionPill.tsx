/**
 * ConnectionPill — a small dot + label showing live connection health.
 * Drop it in a game header so a player can tell a network drop from a bug.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useConnectionHealth, type ConnStatus } from '../lib/useConnectionHealth';
import { colors, font, radius, space } from '../theme';

const META: Record<ConnStatus, { color: string; label: string }> = {
  good:         { color: colors.success, label: 'Good' },
  weak:         { color: colors.warning, label: 'Weak' },
  reconnecting: { color: colors.danger,  label: 'Reconnecting' },
  offline:      { color: colors.danger,  label: 'Offline' },
};

export function ConnectionPill() {
  const { status, pingMs } = useConnectionHealth();
  const meta = META[status];
  // When healthy, the ping number is more informative than "Good".
  const label = status === 'good' && pingMs != null ? `${pingMs}ms` : meta.label;
  return (
    <View style={styles.pill} accessibilityLabel={`Connection: ${meta.label}`}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.label, { color: meta.color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: space.sm, paddingVertical: 4,
    borderRadius: radius.sm, backgroundColor: 'rgba(0,0,0,0.28)',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontFamily: font.bold, fontSize: 11 },
});
