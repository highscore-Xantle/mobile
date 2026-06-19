import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// STUB — Promise's task: email + Google + Apple via Supabase Auth, then route
// to /onboarding (username) on first sign-in, else to /home.
export default function Login() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <Text style={styles.h}>Sign in</Text>
        <Text style={styles.p}>Email · Google · Apple — wiring next (Promise).</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0F1A' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  h: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  p: { color: '#8A94A6', fontSize: 15, textAlign: 'center' },
});
