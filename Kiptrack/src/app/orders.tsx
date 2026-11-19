import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/chip';
import { Icon } from '@/components/icon';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useBuyerOrders } from '@/hooks/use-orders';
import { useTheme } from '@/hooks/use-theme';
import { detectLocale, formatMoney } from '@/lib/format';
import { ORDER_STATUS_LABEL } from '@/lib/orders';

const locale = detectLocale();

/** Order history for the signed-in buyer, newest first. */
export default function OrdersScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status, orders, error, reload } = useBuyerOrders();

  if (status === 'loading') {
    return (
      <Screen>
        <LoadingState label="Loading your orders…" />
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen>
        <ErrorState
          title="Orders unavailable"
          message={error instanceof Error ? error.message : 'We could not load your orders.'}
          retryLabel="Try again"
          onRetry={reload}
        />
      </Screen>
    );
  }

  if (orders.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="orders"
          title="No orders yet"
          message="Orders you place at checkout will be listed here."
          actionLabel="Browse the catalogue"
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}
        showsVerticalScrollIndicator={false}>
        {orders.map((order) => {
          const placedAt = new Date(order.createdAt);
          const date = Number.isNaN(placedAt.getTime())
            ? ''
            : placedAt.toLocaleDateString(locale === 'fr' ? 'fr-CM' : 'en-CM', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });

          return (
            <Pressable
              key={order.id}
              accessibilityRole="button"
              accessibilityLabel={`Order ${order.reference}, ${ORDER_STATUS_LABEL[order.status]}`}
              accessibilityHint="Opens the order"
              onPress={() => router.push({ pathname: '/orders/[id]', params: { id: order.id } })}
              style={({ pressed }) => [
                styles.order,
                { borderColor: theme.border, backgroundColor: pressed ? theme.surfaceRaised : theme.surface },
              ]}>
              <View style={styles.orderTop}>
                <View style={styles.orderId}>
                  <ThemedText variant="callout">{order.reference}</ThemedText>
                  <ThemedText variant="footnote" tone="textTertiary">
                    {date}
                  </ThemedText>
                </View>
                <Badge
                  label={ORDER_STATUS_LABEL[order.status].toUpperCase()}
                  tone={order.status === 'delivered' ? 'accent' : 'neutral'}
                />
              </View>

              <View style={styles.items}>
                {order.items.slice(0, 3).map((item) => (
                  <ThemedText key={item.id} variant="footnote" tone="textSecondary" numberOfLines={1}>
                    {item.qty} × {item.title}
                  </ThemedText>
                ))}
                {order.items.length > 3 ? (
                  <ThemedText variant="caption" tone="textTertiary">
                    +{order.items.length - 3} more
                  </ThemedText>
                ) : null}
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <View style={styles.orderFooter}>
                <ThemedText variant="footnote" tone="textTertiary" numberOfLines={1} style={styles.address}>
                  {order.address.city} · {order.address.phone}
                </ThemedText>
                <View style={styles.total}>
                  <ThemedText variant="bodyStrong">{formatMoney(order.subtotalMinor, locale)}</ThemedText>
                  <Icon name="chevron" size={14} color={theme.textTertiary} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: ScreenPadding, gap: Spacing.three },
  order: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  orderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  orderId: { gap: Spacing.half },
  items: { gap: Spacing.half },
  divider: { height: StyleSheet.hairlineWidth },
  orderFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  address: { flex: 1 },
  total: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
