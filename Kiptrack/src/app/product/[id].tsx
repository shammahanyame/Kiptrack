import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ProductImage } from '@/components/product-image';
import { PrimaryButton, SecondaryButton } from '@/components/button';
import { Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useProduct } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/catalog';
import { detectLocale, formatMoney, formatStock } from '@/lib/format';
import { useSaved } from '@/state/saved';

const locale = detectLocale();

export default function ProductDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, product, error, reload } = useProduct(id);
  const { isSaved, toggle } = useSaved();

  const saved = product ? isSaved(product.id) : false;
  const soldOut = (product?.stockQty ?? 0) <= 0;

  const shippingLabel = useMemo(() => {
    if (!product) return '';
    if (product.isShippingFree) return 'Free delivery';
    if (product.shippingMinor > 0) return `Delivery ${formatMoney(product.shippingMinor, locale)}`;
    return 'Delivery arranged with the seller';
  }, [product]);

  if (status === 'loading') {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <LoadingState label="Loading this item…" />
      </Screen>
    );
  }

  if (status === 'error' || !product) {
    const missing = product === null || /not found/i.test(String((error as Error)?.message ?? ''));
    return (
      <Screen>
        <Stack.Screen options={{ title: missing ? 'Item unavailable' : 'Item' }} />
        <ErrorState
          title={missing ? 'No longer available' : 'Could not load this item'}
          message={
            missing
              ? 'This item may have sold out or been removed from the catalogue.'
              : errorMessage(error, locale)
          }
          retryLabel={missing ? 'Browse items' : 'Try again'}
          onRetry={() => {
            if (missing) {
              router.replace('/');
            } else {
              reload();
            }
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: product.title }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}>
        <ProductImage
          uri={product.images[0]}
          seed={product.id}
          style={styles.hero}
          accessibilityLabel={product.title}
        />

        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Badge label={formatStock(product.stockQty, locale)} tone={soldOut ? 'neutral' : 'accent'} />
            {product.featured ? <Badge label="FEATURED" tone="neutral" /> : null}
          </View>

          <ThemedText variant="title">{product.title}</ThemedText>

          <View style={styles.priceRow}>
            <ThemedText variant="title" tone="text" style={styles.numeric}>
              {formatMoney(product.priceMinor, locale)}
            </ThemedText>
            <ThemedText variant="footnote" tone="textTertiary">
              incl. taxes
            </ThemedText>
          </View>

          <View style={[styles.factList, { borderColor: theme.border }]}>
            <View style={styles.fact}>
              <Icon name="shipping" size={18} color={theme.textSecondary} />
              <ThemedText variant="footnote" tone="textSecondary" style={styles.factText}>
                {shippingLabel}
              </ThemedText>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.fact}>
              <Icon name="verified" size={18} color={theme.textSecondary} />
              <ThemedText variant="footnote" tone="textSecondary" style={styles.factText}>
                Sold by a verified Kiptrack seller
              </ThemedText>
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText variant="headline" accessibilityRole="header">
              About this item
            </ThemedText>
            <ThemedText variant="body" tone="textSecondary" style={styles.description}>
              {product.description.trim() || 'The seller has not added a description yet.'}
            </ThemedText>
          </View>

          <View style={[styles.note, { backgroundColor: theme.surface }]}>
            <Icon name="info" size={16} color={theme.textSecondary} />
            <ThemedText variant="footnote" tone="textSecondary" style={styles.noteText}>
              Checkout and seller messaging are not switched on in this preview.
            </ThemedText>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomBar,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.three),
            backgroundColor: theme.background,
            borderTopColor: theme.border,
          },
        ]}>
        {saved ? (
          <SecondaryButton
            label="Saved"
            onPress={() => toggle(product.id)}
            icon={<Icon name="savedFilled" size={18} color={theme.accentStrong} />}
            style={styles.action}
          />
        ) : (
          <PrimaryButton
            label="Save item"
            onPress={() => toggle(product.id)}
            icon={<Icon name="savedOutline" size={18} color={theme.onPrimary} />}
            style={styles.action}
            accessibilityHint="Adds this item to your saved list"
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 0,
  },
  body: {
    padding: ScreenPadding,
    gap: Spacing.three,
  },
  metaRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    marginTop: -Spacing.one,
  },
  numeric: {
    fontVariant: ['tabular-nums'],
  },
  factList: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    minHeight: 44,
  },
  factText: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  section: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  description: {
    lineHeight: 25,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  noteText: {
    flex: 1,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.three,
    paddingHorizontal: ScreenPadding,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: {
    width: '100%',
  },
});
