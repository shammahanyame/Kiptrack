import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Locale } from '@/lib/format';
import type { Review } from '@/lib/reviews';

type Props = {
  reviews: Review[];
  locale: Locale;
};

/** Star row with the filled count driven by the rating. */
export function Stars({ rating, size = 'body' }: { rating: number; size?: 'body' | 'caption' }) {
  const rounded = Math.round(rating);
  return (
    <ThemedText variant={size} tone="accentText" accessibilityLabel={`${rating} out of 5 stars`}>
      {'★'.repeat(rounded)}
      <ThemedText variant={size} tone="textTertiary">
        {'★'.repeat(Math.max(0, 5 - rounded))}
      </ThemedText>
    </ThemedText>
  );
}

export function ProductReviews({ reviews, locale }: Props) {
  const theme = useTheme();

  if (reviews.length === 0) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {reviews.map((review) => (
        <View key={review.id} style={[styles.review, { borderBottomColor: theme.border }]}>
          <View style={styles.header}>
            <Stars rating={review.rating} />
            <ThemedText variant="caption" tone="textTertiary">
              {new Date(review.createdAt).toLocaleDateString(locale === 'fr' ? 'fr-CM' : 'en-CM', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </ThemedText>
          </View>
          <ThemedText variant="bodyStrong" numberOfLines={2}>
            {review.title}
          </ThemedText>
          <ThemedText variant="body" tone="textSecondary">
            {review.body}
          </ThemedText>
          <ThemedText variant="caption" tone="textTertiary">
            {review.buyerName}
          </ThemedText>
        </View>
      ))}
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
  review: {
    padding: Spacing.three,
    gap: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
