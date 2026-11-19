import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/button';
import { ProductReviews, Stars } from '@/components/product-reviews';
import { ReviewForm } from '@/components/review-form';
import { Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useProduct } from '@/hooks/use-catalog';
import { useProductReviews } from '@/hooks/use-reviews';
import { useTheme } from '@/hooks/use-theme';
import { detectLocale } from '@/lib/format';
import { createReview, reviewErrorMessage } from '@/lib/reviews';
import { useAuth } from '@/state/auth';

const locale = detectLocale();

/** Every review for an item, the rating breakdown, and the form to add one. */
export default function ReviewsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { product } = useProduct(id);
  const { status, reviews, summary, error, reload } = useProductReviews(id);
  const { user } = useAuth();

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async () => {
    setFormError('');
    setNotice('');
    if (!id) return;
    if (rating < 1) return setFormError('Pick a star rating first.');
    if (!title.trim() || !body.trim()) return setFormError('Add a headline and a few words.');

    setBusy(true);
    try {
      await createReview({ productId: id, rating, title, body });
      setRating(0);
      setTitle('');
      setBody('');
      setNotice('Thanks — your review is published.');
      reload();
    } catch (caught) {
      setFormError(reviewErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <ThemedText variant="title" numberOfLines={2}>
            {product?.title ?? 'Reviews'}
          </ThemedText>
          <ThemedText variant="footnote" tone="textSecondary">
            {summary.count === 0
              ? 'No reviews yet'
              : `${summary.count} ${summary.count === 1 ? 'review' : 'reviews'}`}
          </ThemedText>
        </View>

        <View style={[styles.summary, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={styles.average}>
            <ThemedText variant="display">{summary.average.toFixed(1)}</ThemedText>
            <Stars rating={summary.average} />
            <ThemedText variant="caption" tone="textTertiary">
              {summary.count} {summary.count === 1 ? 'rating' : 'ratings'}
            </ThemedText>
          </View>

          <View style={styles.bars}>
            {summary.distribution.map((row) => {
              const share = summary.count === 0 ? 0 : (row.count / summary.count) * 100;
              return (
                <View key={row.stars} style={styles.barRow}>
                  <ThemedText variant="caption" tone="textSecondary" style={styles.barLabel}>
                    {row.stars} ★
                  </ThemedText>
                  <View style={[styles.track, { backgroundColor: theme.skeleton }]}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${share}%`, backgroundColor: theme.accentStrong },
                      ]}
                    />
                  </View>
                  <ThemedText variant="caption" tone="textTertiary" style={styles.barCount}>
                    {row.count}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        </View>

        {status === 'loading' ? (
          <LoadingState label="Loading reviews…" />
        ) : status === 'error' ? (
          <ErrorState
            title="Reviews unavailable"
            message={error instanceof Error ? error.message : 'We could not load reviews for this item.'}
            retryLabel="Try again"
            onRetry={reload}
          />
        ) : reviews.length === 0 ? (
          <ThemedText variant="body" tone="textSecondary" style={styles.empty}>
            Nothing here yet. Be the first to share what you think of this item.
          </ThemedText>
        ) : (
          <ProductReviews reviews={reviews} locale={locale} />
        )}

        {user ? (
          <View style={styles.form}>
            {notice ? (
              <ThemedText variant="footnote" tone="success" accessibilityRole="alert">
                {notice}
              </ThemedText>
            ) : null}
            {formError ? (
              <ThemedText variant="footnote" tone="danger" accessibilityRole="alert">
                {formError}
              </ThemedText>
            ) : null}
            <ReviewForm
              rating={rating}
              setRating={setRating}
              title={title}
              setTitle={setTitle}
              body={body}
              setBody={setBody}
              onSubmit={submit}
              busy={busy}
            />
          </View>
        ) : (
          <View style={styles.signIn}>
            <ThemedText variant="body" tone="textSecondary" style={styles.empty}>
              Sign in to rate and review this item.
            </ThemedText>
            <PrimaryButton label="Sign in to review" onPress={() => router.push('/login')} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: ScreenPadding, gap: Spacing.three },
  heading: { gap: Spacing.half },
  summary: {
    flexDirection: 'row',
    gap: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
  },
  average: { alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
  bars: { flex: 1, gap: Spacing.one, justifyContent: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  barLabel: { width: 28 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  barCount: { width: 24, textAlign: 'right' },
  empty: { textAlign: 'center', paddingVertical: Spacing.two },
  form: { gap: Spacing.two },
  signIn: { gap: Spacing.three, paddingVertical: Spacing.three },
});
