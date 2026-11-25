import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/chip';
import { PrimaryButton, SecondaryButton } from '@/components/button';
import { Icon } from '@/components/icon';
import { ErrorState, LoadingState } from '@/components/states';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useBuyerOrder } from '@/hooks/use-orders';
import { useTheme } from '@/hooks/use-theme';
import { detectLocale, formatMoney } from '@/lib/format';
import { cancelOrder, ORDER_STEPS, ORDER_STATUS_LABEL } from '@/lib/orders';
import { paymentMethodLabel } from '@/lib/payments';
import { useCart } from '@/state/cart';

const locale = detectLocale();

/** One order: where it is, what it contains, where it goes and how to re-order. */
export default function OrderDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, order, error, reload } = useBuyerOrder(id);
  const { add } = useCart();
  const [cancelling, setCancelling] = useState(false);

  if (status === 'loading') {
    return (
      <Screen>
        <LoadingState label="Loading your order…" />
      </Screen>
    );
  }

  if (status === 'error' || !order) {
    return (
      <Screen>
        <ErrorState
          title="Order unavailable"
          message={
            error instanceof Error && /not found/i.test(error.message)
              ? 'We could not find that order on this account.'
              : error instanceof Error
                ? error.message
                : 'We could not load this order.'
          }
          retryLabel="Try again"
          onRetry={reload}
        />
      </Screen>
    );
  }

  const stepIndex = ORDER_STEPS.findIndex((step) => step.status === order.status);
  const cancelled = order.status === 'cancelled';
  const placedAt = new Date(order.createdAt);
  const placedLabel = Number.isNaN(placedAt.getTime())
    ? ''
    : placedAt.toLocaleDateString(locale === 'fr' ? 'fr-CM' : 'en-CM', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  const buyAgain = () => {
    order.items.forEach((item) => {
      add({
        product: item.product,
        sku: item.sku || item.product,
        title: item.title,
        priceMinor: item.priceMinor,
        image: item.image,
        qty: item.qty,
        selectedOptions: {},
      });
    });
    router.push('/cart');
  };

  const cancellable = order.status === 'placed' || order.status === 'confirmed';

  const confirmCancel = () => {
    Alert.alert(
      'Cancel this order?',
      'The seller will be told it is cancelled and the items go back on sale.',
      [
        { text: 'Keep order', style: 'cancel' },
        {
          text: 'Cancel order',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await cancelOrder(order.id);
              reload();
            } catch (caught) {
              Alert.alert(
                'Could not cancel',
                caught instanceof Error ? caught.message : 'Something went wrong. Try again.',
              );
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <View style={styles.headingText}>
            <ThemedText variant="title">{order.reference}</ThemedText>
            <ThemedText variant="footnote" tone="textSecondary">
              Placed {placedLabel}
            </ThemedText>
          </View>
          <Badge label={ORDER_STATUS_LABEL[order.status].toUpperCase()} tone="accent" />
        </View>

        {cancelled ? (
          <View style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText variant="callout">This order was cancelled.</ThemedText>
            <ThemedText variant="footnote" tone="textSecondary">
              Get in touch with the seller if you need help with it.
            </ThemedText>
          </View>
        ) : (
          <View style={[styles.card, { borderColor: theme.border }]}>
            {ORDER_STEPS.map((step, index) => {
              const done = index <= stepIndex;
              const isLast = index === ORDER_STEPS.length - 1;
              return (
                <View key={step.status} style={styles.step}>
                  <View style={styles.markerColumn}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: done ? theme.accentStrong : theme.skeleton },
                      ]}>
                      {done ? <Icon name="verified" size={12} color={theme.onAccent} /> : null}
                    </View>
                    {!isLast ? (
                      <View
                        style={[
                          styles.connector,
                          { backgroundColor: index < stepIndex ? theme.accentStrong : theme.skeleton },
                        ]}
                      />
                    ) : null}
                  </View>
                  <View style={styles.stepBody}>
                    <ThemedText variant="callout" tone={done ? 'text' : 'textTertiary'}>
                      {step.label}
                    </ThemedText>
                    <ThemedText variant="footnote" tone="textTertiary">
                      {step.hint}
                    </ThemedText>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText variant="headline">Items</ThemedText>
          {order.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <ThemedText variant="callout" numberOfLines={2} style={styles.itemTitle}>
                {item.qty} × {item.title}
              </ThemedText>
              <ThemedText variant="callout">{formatMoney(item.priceMinor * item.qty, locale)}</ThemedText>
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.itemRow}>
            <ThemedText variant="bodyStrong">Total</ThemedText>
            <ThemedText variant="bodyStrong">{formatMoney(order.subtotalMinor, locale)}</ThemedText>
          </View>
          <ThemedText variant="footnote" tone="textTertiary">
            Delivery is arranged with the seller and paid separately.
          </ThemedText>
        </View>

        <View style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText variant="headline">Payment</ThemedText>
          <ThemedText variant="callout">{paymentMethodLabel(order.paymentMethod)}</ThemedText>
          <ThemedText variant="footnote" tone="textSecondary">
            Status: {order.paymentStatus}
          </ThemedText>
          {order.paymentRef ? (
            <ThemedText variant="caption" tone="textTertiary">
              Ref: {order.paymentRef}
            </ThemedText>
          ) : null}
        </View>

        <View style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText variant="headline">Delivery</ThemedText>
          <ThemedText variant="callout">{order.address.name}</ThemedText>
          <ThemedText variant="footnote" tone="textSecondary">
            {order.address.city} · {order.address.phone}
          </ThemedText>
          {order.address.notes ? (
            <ThemedText variant="footnote" tone="textTertiary">
              {order.address.notes}
            </ThemedText>
          ) : null}
        </View>

        {cancellable ? (
          <SecondaryButton
            label={cancelling ? 'Cancelling…' : 'Cancel order'}
            onPress={confirmCancel}
            disabled={cancelling}
            accessibilityHint="Cancels this order and returns the items to stock"
          />
        ) : null}
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
        <SecondaryButton label="All orders" onPress={() => router.push('/orders')} style={styles.secondary} />
        <PrimaryButton label="Buy again" onPress={buyAgain} style={styles.primary} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: ScreenPadding, gap: Spacing.three },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  headingText: { gap: Spacing.half, flex: 1 },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  step: { flexDirection: 'row', gap: Spacing.three },
  markerColumn: { alignItems: 'center', width: 20 },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  connector: { width: 2, flex: 1, minHeight: 22, marginVertical: 2 },
  stepBody: { flex: 1, gap: Spacing.half, paddingBottom: Spacing.two },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  itemTitle: { flex: 1 },
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
  secondary: { flex: 1 },
  primary: { flex: 2 },
});
