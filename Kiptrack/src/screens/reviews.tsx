import { router } from 'expo-router';
import { useMemo } from 'react';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ProductReviews } from '@/components/product-reviews';
import { ReviewForm } from '@/components/review-form';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { detectLocale } from '@/lib/format';
import { useReviews } from '@/state/reviews';

export default function ReviewsScreen() {
  const theme = useTheme();
  const locale = detectLocale();
  const { reviews, isEmpty, loadReviews, addReview, ready } = useReviews();

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      await addReview('product-1', rating, title, body);
      setTitle('');
      setBody('');
      setRating(0);
      await loadReviews('product-1');
    } catch (error) {
      // handled by the consumer
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ThemedText variant="display">Reviews</ThemedText>
          <ThemedText variant="footnote" tone="textSecondary">
            {ready ? `${reviews.length} review${reviews.length === 1 ? '' : 's'}` : 'Loading…'}
          </ThemedText>
        </View>

        {isEmpty ? (
          <View style={styles.empty}>
            <ThemedText variant="body" tone="textSecondary">
              No reviews yet.
            </ThemedText>
            <ThemedText variant="body" tone="textSecondary">
              Be the first to share your experience.
            </ThemedText>
          </View>
        ) : (
          <ProductReviews reviews={reviews} locale={locale} />
        )}

        {ready ? (
          <ReviewForm
            rating={rating}
            setRating={(r) => setRating(r)}
            title={title}
            setTitle={(t) => setTitle(t)}
            body={body}
            setBody={(b) => setBody(b)}
            onSubmit={handleSubmit}
            busy={busy}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: ScreenPadding,
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
