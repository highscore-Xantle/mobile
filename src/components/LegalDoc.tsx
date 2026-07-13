import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from './GradientFill';
import { DocSection } from '../content/legal';
import { useGoBackOr } from '../lib/navigation';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

/** Shared renderer for Settings → About / Terms / Privacy — same topBar as profile.tsx/settings.tsx. */
export function LegalDoc({
  title,
  intro,
  sections,
}: {
  title: string;
  intro?: string;
  sections: DocSection[];
}) {
  const goBack = useGoBackOr('/settings');

  return (
    <View style={styles.root}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={goBack}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <Text style={themeText.h2}>{title}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {intro ? <Text style={[themeText.body, styles.intro]}>{intro}</Text> : null}

          {sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={themeText.title}>{section.heading}</Text>
              {section.blocks.map((block, i) =>
                'bullets' in block ? (
                  <View key={i} style={styles.bulletList}>
                    {block.bullets.map((line) => (
                      <View key={line} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={[themeText.body, styles.bulletText]}>{line}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text key={i} style={[themeText.body, styles.paragraph]}>
                    {block.text}
                  </Text>
                ),
              )}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backGlyph: { color: colors.text, fontSize: 22, marginTop: -2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },

  content: { paddingBottom: space.xl },
  intro: { color: colors.textMuted, lineHeight: 21, marginBottom: space.lg },

  section: { marginBottom: space.lg },
  paragraph: { color: colors.textMuted, lineHeight: 21, marginTop: space.xs },

  bulletList: { marginTop: space.xs, gap: space.xs },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  bulletDot: { color: colors.textFaint, fontSize: 15, lineHeight: 21 },
  bulletText: { flex: 1, color: colors.textMuted, lineHeight: 21 },
});
