import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SecondaryButton } from '@/components/button';
import { Icon } from '@/components/icon';
import { ProductImage } from '@/components/product-image';
import { Screen } from '@/components/screen';
import { EmptyState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { detectLocale, formatMoney } from '@/lib/format';
import { cartLineKey, useCart } from '@/state/cart';

const locale = detectLocale();

/**
 * Cart screen. Lines live on this device (no account needed to shop); checkout
 * asks the buyer to sign in so the order has an owner.
 */
export default function CartScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { lines, count, subtotalMinor, setQty, remove, clear } = useCart();

  const confirmClear = () => {
    Alert.alert('Clear your cart?', 'Every item will be removed from this cart.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear cart', style: 'destructive', onPress: clear },
    ]);
  };

  if (lines.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="cart"
          title="Your cart is empty"
          message="Items you add while browsing are kept here on this device."
          actionLabel="Browse the catalogue"
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}>
        {lines.map((line) => {
          const key = cartLineKey(line);
          const optionLabels = Object.entries(line.selectedOptions);

          return (
            <View
              key={key}
              style={[styles.line, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={styles.lineTop}>
                <ProductImage uri={line.image} seed={line.product} style={styles.thumb} showMark={false} />
                <View style={styles.lineText}>
                  <ThemedText variant="callout" numberOfLines={2}>
                    {line.title}
                  </ThemedText>
                  <ThemedText variant="footnote" tone="textSecondary" numberOfLines={1}>
                    {formatMoney(line.priceMinor, locale)} each
                  </ThemedText>
                  {optionLabels.length > 0 ? (
                    <ThemedText variant="caption" tone="textTertiary" numberOfLines={1}>
                      {optionLabels.map(([name, value]) => `${name}: ${value}`).join(' · ')}
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${line.title} from cart`}
                  hitSlop={10}
                  onPress={() => remove(key)}
                  style={[styles.remove, { borderColor: theme.border }]}>
                  <Icon name="trash" size={16} color={theme.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.lineBottom}>
                <View style={[styles.stepper, { borderColor: theme.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Decrease quantity"
                    onPress={() => setQty(key, line.qty - 1)}
                    style={styles.step}>
                    <Icon name="minus" size={14} color={theme.text} />
                  </Pressable>
                  <ThemedText variant="callout" style={styles.qty}>
                    {line.qty}
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Increase quantity"
                    onPress={() => setQty(key, line.qty + 1)}
                    style={styles.step}>
                    <Icon name="plus" size={14} color={theme.text} />
                  </Pressable>
                </View>
                <ThemedText variant="price">{formatMoney(line.priceMinor * line.qty, locale)}</ThemedText>
              </View>
            </View>
          );
        })}

        <View style={[styles.summary, { borderColor: theme.border }]}>
          <View style={styles.row}>
            <ThemedText variant="callout" tone="textSecondary">
              {count} {count === 1 ? 'item' : 'items'}
            </ThemedText>
            <ThemedText variant="bodyStrong">{formatMoney(subtotalMinor, locale)}</ThemedText>
          </View>
          <View style={styles.row}>
            <ThemedText variant="callout" tone="textSecondary">
              Delivery
            </ThemedText>
            <ThemedText variant="callout" tone="textSecondary">
              Arranged with the seller
            </ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.row}>
            <ThemedText variant="bodyStrong">Total</ThemedText>
            <ThemedText variant="bodyStrong">{formatMoney(subtotalMinor, locale)}</ThemedText>
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.bar,
          {
            paddingBottom: Math.max(insets.bottom, Spacing.three),
            backgroundColor: theme.background,
            borderTopColor: theme.border,
          },
        ]}>
        <SecondaryButton label="Clear" onPress={confirmClear} style={styles.clear} />
        <PrimaryButton
          label="Checkout"
          onPress={() => router.push('/checkout')}
          style={styles.checkout}
          accessibilityHint="Review your order and enter delivery details"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: ScreenPadding, gap: Spacing.two },
  line: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  lineTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  thumb: { width: 56, height: 56, borderRadius: Radius.medium },
  lineText: { flex: 1, gap: Spacing.half },
  remove: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.medium,
    overflow: 'hidden',
  },
  step: {
    width: TouchTarget,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: { minWidth: 28, textAlign: 'center' },
  summary: {
    marginTop: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  divider: { height: StyleSheet.hairlineWidth },
  bar: {
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
  clear: { flex: 1 },
  checkout: { flex: 2 },
});
