import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/chip';
import { CartButton } from '@/components/cart-button';
import { Icon } from '@/components/icon';
import { ProductCard } from '@/components/product-card';
import { ProductImage } from '@/components/product-image';
import { Stars } from '@/components/product-reviews';
import { PrimaryButton, SecondaryButton } from '@/components/button';
import { Screen } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useProduct, useRelatedProducts } from '@/hooks/use-catalog';
import { useProductReviews } from '@/hooks/use-reviews';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/catalog';
import { detectLocale, formatMoney, formatStock } from '@/lib/format';
import { useCart } from '@/state/cart';
import { useNav } from '@/state/nav';
import { useRecent } from '@/state/recent';
import { useSaved } from '@/state/saved';

const locale = detectLocale();

export default function ProductDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, product, error, reload } = useProduct(id);
  const { isSaved, toggle } = useSaved();
  const { add } = useCart();
  const { summary } = useProductReviews(product?.id);
  const related = useRelatedProducts(product?.categoryId, product?.id);
  const { record: recordRecent } = useRecent();
  const { recordView } = useNav();
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (product) recordRecent(product.id);
  }, [product, recordRecent]);

  // Feeds the personalised category bar with what this shopper actually opens.
  useEffect(() => {
    if (product) recordView({ id: product.categoryId, name: '', slug: '', parentId: null });
  }, [product?.categoryId, recordView]);

  // A new product (from the recommendations rail) starts on its cover photo.
  useEffect(() => {
    setActiveImage(0);
  }, [product?.id]);

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

  const images = product.images.filter(Boolean);
  const cover = images[activeImage] ?? images[0];

  const addToCart = () => {
    if (soldOut) return;
    add({
      product: product.id,
      sku: product.id,
      title: product.title,
      priceMinor: product.priceMinor,
      image: product.images[0],
      qty: 1,
      selectedOptions: {},
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const buyNow = () => {
    if (soldOut) return;
    router.push({ pathname: '/checkout', params: { buyNow: product.id } });
  };

  return (
    <Screen>
      <Stack.Screen
        options={{ title: product.title, headerRight: () => <CartButton /> }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}>
        <ProductImage
          uri={cover}
          seed={product.id}
          style={styles.hero}
          accessibilityLabel={product.title}
        />

        {images.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbs}>
            {images.map((uri, index) => {
              const selected = index === activeImage;
              return (
                <Pressable
                  key={`${uri}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Photo ${index + 1} of ${images.length}`}
                  accessibilityState={{ selected }}
                  onPress={() => setActiveImage(index)}
                  style={[
                    styles.thumbWrap,
                    { borderColor: selected ? theme.accentStrong : theme.border },
                  ]}>
                  <ProductImage
                    uri={uri}
                    seed={`${product.id}-${index}`}
                    style={styles.thumb}
                    showMark={false}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

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

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              summary.count > 0
                ? `Rated ${summary.average.toFixed(1)} out of 5 from ${summary.count} reviews`
                : 'Be the first to review this item'
            }
            onPress={() =>
              router.push({ pathname: '/reviews/[id]', params: { id: product.id } })
            }
            style={styles.ratingRow}>
            {summary.count > 0 ? (
              <>
                <Stars rating={summary.average} size="caption" />
                <ThemedText variant="footnote" tone="textSecondary">
                  {summary.average.toFixed(1)} · {summary.count}{' '}
                  {summary.count === 1 ? 'review' : 'reviews'}
                </ThemedText>
              </>
            ) : (
              <ThemedText variant="footnote" tone="accentText">
                Be the first to review this item
              </ThemedText>
            )}
          </Pressable>

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
              Delivery is arranged directly with the seller after you place the order.
            </ThemedText>
          </View>

          {related.length > 0 ? (
            <View style={styles.related}>
              <ThemedText variant="headline" accessibilityRole="header">
                More like this
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.relatedRow}>
                {related.map((item) => (
                  <View key={item.id} style={styles.relatedItem}>
                    <ProductCard
                      product={item}
                      locale={locale}
                      saved={isSaved(item.id)}
                      onOpen={() =>
                        router.push({ pathname: '/product/[id]', params: { id: item.id } })
                      }
                      onToggleSave={() => toggle(item.id)}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? `Remove ${product.title} from saved` : `Save ${product.title}`}
          accessibilityState={{ selected: saved }}
          onPress={() => toggle(product.id)}
          style={({ pressed }) => [
            styles.saveIcon,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <Icon
            name={saved ? 'savedFilled' : 'savedOutline'}
            size={20}
            color={saved ? theme.accentStrong : theme.text}
          />
        </Pressable>
        <SecondaryButton
          label={soldOut ? 'Out of stock' : added ? 'Added to cart' : 'Add to cart'}
          onPress={addToCart}
          disabled={soldOut}
          style={styles.action}
          accessibilityHint="Adds this item to your cart"
        />
        <PrimaryButton
          label="Buy now"
          onPress={buyNow}
          disabled={soldOut}
          style={styles.action}
          accessibilityHint="Skips the cart and goes straight to checkout with this item"
        />
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
  thumbs: {
    gap: Spacing.two,
    paddingHorizontal: ScreenPadding,
    paddingTop: Spacing.three,
  },
  thumbWrap: {
    width: 68,
    height: 68,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 4,
    padding: 2,
  },
  thumb: {
    width: '100%',
    height: '100%',
    borderRadius: Radius.small,
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
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
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
  related: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  relatedRow: {
    gap: Spacing.three,
  },
  relatedItem: {
    width: 150,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.three,
    paddingHorizontal: ScreenPadding,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveIcon: {
    width: 50,
    minHeight: 50,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    flex: 1,
  },
});
