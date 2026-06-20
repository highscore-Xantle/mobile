import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, text as themeText } from '../theme';

export default function Onboarding() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={themeText.h1}>Onboarding</Text>
        <Text style={themeText.body}>Username capture goes here (Day 3 - Sam).</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
