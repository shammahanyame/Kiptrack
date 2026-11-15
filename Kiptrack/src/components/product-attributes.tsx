import { FlatList, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ProductAttribute } from '@/state/attributes';

type Props = {
  attributes: ProductAttribute[];
  locale: 'en' | 'fr';
};

export function ProductAttributes({ attributes, locale }: Props) {
  const theme = useTheme();

  if (attributes.length === 0) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <ThemedText variant="bodyStrong" tone="text" style={styles.sectionTitle}>
        Attributes
      </ThemedText>

      <FlatList
        data={attributes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={styles.attribute}>
            <ThemedText variant="footnote" tone="textSecondary" style={styles.attributeName}>
              {item.name}
            </ThemedText>
            <ThemedText variant="footnote" tone="text">
              {item.value}
            </ThemedText>
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
  attribute: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  attributeName: {
    flex: 1,
  },
});
