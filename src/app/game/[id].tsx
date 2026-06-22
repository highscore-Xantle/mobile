import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, text as themeText, space, radius, shadow, font } from '../../theme';
import { GradientFill } from '../../components/GradientFill';

export default function GameStub() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <GradientFill colors={[colors.surface, colors.bg]} />
      <SafeAreaView style={styles.safe}>
        
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        </View>

        <View style={styles.center}>
          <View style={styles.card}>
            <Text style={themeText.h2}>Game Engine</Text>
            <Text style={styles.id}>ID: {id}</Text>
            <Text style={styles.subtitle}>
              This is Victor's E2 task.{'\n'}The real game loads here.
            </Text>
          </View>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  
  header: { paddingVertical: space.md },
  backBtn: { 
    width: 44, height: 44, 
    borderRadius: radius.md, 
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.card
  },
  backArrow: { fontFamily: font.extrabold, fontSize: 18, color: colors.text },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    padding: space.xl,
    borderRadius: radius.xl,
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1, borderColor: colors.hairline,
    ...shadow.card
  },
  id: { fontFamily: font.bold, fontSize: 16, color: colors.cyan },
  subtitle: { 
    fontFamily: font.semibold, 
    color: colors.textMuted, 
    textAlign: 'center', 
    lineHeight: 22,
    marginTop: space.sm 
  }
});
