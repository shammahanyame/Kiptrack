import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Variation } from '@/state/attributes';

type Props = {
  variations: Variation[];
  locale: 'en' | 'fr';
  onSelectVariation: (id: string) => void;
};

export function ProductVariations({ variations, locale, onSelectVariation }: Props) {
  const theme = useTheme();

  if (variations.length === 0) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <ThemedText variant="bodyStrong" tone="text" style={styles.sectionTitle}>
        Options
      </ThemedText>

      <FlatList
        data={variations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.variation}>
            <ThemedText variant="footnote" tone="textSecondary" style={styles.variationName}>
              {item.name}
            </ThemedText>
            <View style={styles.options}>
              {item.options.map((option) => (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  onPress={() => onSelectVariation(item.id)}
                  style={[
                    styles.option,
                    item.selectedOptionId === option.id && { backgroundColor: theme.accent },
                  ]}
                >
                  <ThemedText
                    variant="caption"
                    tone={item.selectedOptionId === option.id ? 'onAccent' : 'text'}
                  >
                    {option.value}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E6E1',
    overflow: 'hidden',
  },
  sectionTitle: {
    padding: Spacing.three,
  },
  list: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  variation: {
    gap: Spacing.two,
  },
  variationName: {
    flex: 1,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  option: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E6E1',
  },
});
