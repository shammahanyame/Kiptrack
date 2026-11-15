import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Review } from '@/state/reviews';

type Props = {
  reviews: Review[];
  locale: 'en' | 'fr';
};

export function ProductReviews({ reviews, locale }: Props) {
  const theme = useTheme();

  if (reviews.length === 0) {
    return null;
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <ThemedText variant="bodyStrong" tone="text" style={styles.sectionTitle}>
        Reviews
      </ThemedText>

      {reviews.map((review) => (
        <View key={review.id} style={styles.review}>
          <View style={styles.stars}>
            {Array.from({ length: 5 }, (_, i) => i < review.rating).map((filled, i) => (
              <ThemedText key={i}>★</ThemedText>
            ))}
          </View>
          <ThemedText variant="footnote" tone="textSecondary">
            {review.title}
          </ThemedText>
          <ThemedText variant="body" tone="textSecondary">
            {review.body}
          </ThemedText>
          <View style={styles.footer}>
            <ThemedText variant="caption" tone="textTertiary">
              {review.buyer}
            </ThemedText>
            <ThemedText variant="caption" tone="textTertiary" style={styles.footerText}>
              {new Date(review.createdAt).toLocaleDateString(locale === 'fr' ? 'fr' : 'en', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </ThemedText>
          </View>
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
  sectionTitle: {
    padding: Spacing.three,
  },
  review: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    marginLeft: Spacing.two,
  },
});
