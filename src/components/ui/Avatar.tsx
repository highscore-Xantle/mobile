/**
 * Avatar — reusable circular avatar component.
 *
 * Renders a user's initials on the design-system `colors.surface` background
 * with an optional online indicator. Uses `expo-image` when an `imageUrl` is
 * provided, otherwise falls back to the initials letter.
 *
 * Design-system compliant: all values come from theme.ts.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { colors, font, shadow } from '../../theme';

export interface AvatarProps {
  /** Single letter to render when no imageUrl is present. */
  letter: string;
  /** Remote image URL for the user's photo. */
  imageUrl?: string | null;
  /** Diameter of the avatar in dp. Defaults to 40. */
  size?: number;
  /** Show the green online dot. */
  showOnline?: boolean;
}

export function Avatar({ letter, imageUrl, size = 40, showOnline = false }: AvatarProps) {
  const radius = size / 2;
  const innerSize = size - 4;
  const innerRadius = innerSize / 2;
  const dotSize = Math.max(10, Math.round(size * 0.26));
  // A 404ing avatar URL rendered an empty circle; fall back to the initial.
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <View
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: radius },
        shadow.blueGlow,
      ]}
    >
      <View
        style={[
          styles.inner,
          { width: innerSize, height: innerSize, borderRadius: innerRadius },
        ]}
      >
        {imageUrl && !imgFailed ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: innerSize, height: innerSize, borderRadius: innerRadius }}
            contentFit="cover"
            transition={200}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Text style={[styles.letter, { fontSize: Math.max(11, Math.round(size * 0.38)) }]}>
            {letter.toUpperCase()}
          </Text>
        )}
      </View>

      {showOnline && (
        <View
          style={[
            styles.onlineDot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  letter: {
    fontFamily: font.extrabold,
    color: colors.blue,
  },
  onlineDot: {
    position: 'absolute',
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
