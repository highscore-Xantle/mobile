import { StyleSheet, View } from 'react-native';

/**
 * Pure-JS two-stop gradient (interpolated colour slices). We use this instead of
 * expo-linear-gradient so it renders without a native module / dev-build rebuild.
 *
 * Drop it as the FIRST child of a container that has `overflow: 'hidden'` and a
 * borderRadius — it fills the parent behind your content.
 *
 *   <View style={{ borderRadius: 20, overflow: 'hidden' }}>
 *     <GradientFill colors={gradients.button} />
 *     <Text>...</Text>
 *   </View>
 */
function hexToRgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(h1: string, h2: string, t: number) {
  const a = hexToRgb(h1);
  const b = hexToRgb(h2);
  const c = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

export function GradientFill({
  colors,
  horizontal = false,
  steps = 20,
}: {
  colors: [string, string];
  horizontal?: boolean;
  steps?: number;
}) {
  const slices = Array.from({ length: steps }, (_, i) => mix(colors[0], colors[1], i / (steps - 1)));
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { flexDirection: horizontal ? 'row' : 'column' }]}
    >
      {slices.map((c, i) => (
        <View key={i} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}
