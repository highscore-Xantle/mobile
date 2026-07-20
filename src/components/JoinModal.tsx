import { useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { colors, font, gradients, radius, shadow, space } from '../theme';
import { GradientFill } from './GradientFill';

interface JoinModalProps {
  visible: boolean;
  onClose: () => void;
}

export function JoinModal({ visible, onClose }: JoinModalProps) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (code.length !== 5) {
      Alert.alert('Invalid Code', 'Room codes are exactly 5 characters.');
      return;
    }

    const upper = code.toUpperCase();
    setLoading(true);

    // Try Pixel Rush (games table) first.
    const { error: gameErr } = await supabase.rpc('join_game', { p_code: upper, p_guest_name: null });

    if (!gameErr) {
      setLoading(false);
      setCode('');
      onClose();
      router.push(`/game/${upper}`);
      return;
    }

    // Only fall back to Number Duel if the code simply didn't exist in games.
    // Any other error (full, already started) surfaces directly.
    if (gameErr.message !== 'game not found') {
      setLoading(false);
      Alert.alert('Cannot Join', gameErr.message);
      return;
    }

    const { error: roomErr } = await supabase.rpc('join_room', { p_code: upper });
    setLoading(false);

    if (roomErr) {
      // Only a genuine miss should read as "wrong code" — masking 'room is
      // full' / 'already started' told users their VALID code didn't exist.
      Alert.alert('Cannot Join', roomErr.message.includes('not found')
        ? 'No game or room found with that code.'
        : roomErr.message);
      return;
    }

    setCode('');
    onClose();
    router.push(`/room/${upper}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        
        <View style={styles.card}>
          <Text style={styles.title}>Join a Game</Text>
          <Text style={styles.sub}>Enter the 5-character room code from the host.</Text>

          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="A3F9C"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              maxLength={5}
              value={code}
              // Strip whitespace — pasted/typed spaces counted against
              // maxLength and guaranteed a "not found".
              onChangeText={(txt) => setCode(txt.replace(/\s/g, '').toUpperCase())}
              autoCorrect={false}
              autoFocus
            />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable 
              style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed, code.length !== 5 && { opacity: 0.5 }]} 
              onPress={handleJoin}
              disabled={loading || code.length !== 5}
            >
              <GradientFill colors={gradients.button} />
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.joinText}>Join Room</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...(StyleSheet.absoluteFill as ViewStyle), backgroundColor: 'rgba(0,0,0,0.6)' },
  card: {
    backgroundColor: colors.surfaceSolid, // opaque — surface (rgba white) let the page bleed through the sheet
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    paddingBottom: Platform.OS === 'ios' ? 40 : space.xl,
    borderWidth: 1, borderColor: colors.hairline,
    ...shadow.card,
  },
  title: { fontFamily: font.black, fontSize: 24, color: colors.text, marginBottom: space.xs },
  sub: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, marginBottom: space.xl },
  
  inputWrap: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.hairline,
    marginBottom: space.xl,
  },
  input: {
    fontFamily: font.display,
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
    paddingVertical: space.md,
    letterSpacing: 16,
  },

  actions: { flexDirection: 'row', gap: space.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.hairline,
  },
  cancelText: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  
  joinBtn: {
    flex: 2,
    borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    ...shadow.blueGlow,
  },
  joinText: { fontFamily: font.extrabold, fontSize: 16, color: colors.white },
  pressed: { transform: [{ scale: 0.96 }] },
});
