import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, shadow, space } from '../theme';

interface NumberKeypadProps {
  value: string;
  onChange: (val: string) => void;
  maxLength?: number;
  allowDecimal?: boolean;
  disabled?: boolean;
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

function Key({
  label,
  onPress,
  variant = 'default',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'action' | 'ghost';
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(0.88, { damping: 10, stiffness: 300 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 300 });
  };

  const bgColor =
    variant === 'action'
      ? colors.blue
      : variant === 'ghost'
      ? 'transparent'
      : colors.surface;

  const textColor =
    variant === 'action'
      ? colors.white
      : disabled
      ? colors.textFaint
      : colors.text;

  return (
    <Animated.View style={[styles.keyWrap, animStyle]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={disabled ? undefined : onPress}
        style={[
          styles.key,
          { backgroundColor: bgColor },
          variant === 'action' && shadow.blueGlow,
          disabled && { opacity: 0.3 },
        ]}
      >
        <Text style={[styles.keyLabel, { color: textColor }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function NumberKeypad({
  value,
  onChange,
  maxLength = 6,
  allowDecimal = false,
  disabled = false,
}: NumberKeypadProps) {
  const handleKey = (key: string) => {
    if (disabled) return;

    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }

    if (key === '.') {
      if (!allowDecimal) return;
      if (value.includes('.')) return;
      onChange(value === '' ? '0.' : value + '.');
      return;
    }

    if (value.length >= maxLength) return;

    // Prevent leading zeros (except "0.")
    if (value === '0' && key !== '.') {
      onChange(key);
      return;
    }

    onChange(value + key);
  };

  return (
    <View style={[styles.pad, disabled && { opacity: 0.5 }]}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key) => {
            const isDecimal = key === '.';
            const isBackspace = key === '⌫';
            const isDisabled = disabled || (isDecimal && !allowDecimal);

            return (
              <Key
                key={key}
                label={key}
                onPress={() => handleKey(key)}
                variant={isBackspace ? 'action' : isDecimal && !allowDecimal ? 'ghost' : 'default'}
                disabled={isDisabled}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { width: '100%', gap: space.sm },
  row: {
    flexDirection: 'row',
    gap: space.sm,
    justifyContent: 'center',
  },
  keyWrap: { flex: 1 },
  key: {
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadow.card,
  },
  keyLabel: {
    fontFamily: font.display,
    fontSize: 24,
    includeFontPadding: false,
  },
});
