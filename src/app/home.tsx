import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, text as themeText } from '../theme';

export default function Home() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={themeText.h1}>Home Shell</Text>
        <Text style={themeText.body}>Roll-over reveal goes here (Day 3).</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
