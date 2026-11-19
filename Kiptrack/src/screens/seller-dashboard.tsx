import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/button';
import { Badge } from '@/components/chip';
import { ProductImage } from '@/components/product-image';
import { SegmentedControl } from '@/components/rows';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useSellerOrders } from '@/hooks/use-orders';
import { useSellerListings } from '@/hooks/use-seller';
import { useTheme } from '@/hooks/use-theme';
import { detectLocale, formatMoney } from '@/lib/format';
import {
  ORDER_STATUS_LABEL,
  updateOrderStatus,
  type OrderStatus,
  type SellerOrder,
} from '@/lib/orders';
import { deleteListing, setListingStatus, type SellerListing } from '@/lib/seller';
import { useAuth } from '@/state/auth';

const locale = detectLocale();

type Tab = 'listings' | 'orders';

const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  placed: { status: 'confirmed', label: 'Confirm' },
  confirmed: { status: 'shipped', label: 'Mark shipped' },
  shipped: { status: 'delivered', label: 'Mark delivered' },
};

/** Listings at or below this many units are flagged for restocking. */
const LOW_STOCK_THRESHOLD = 3;

/**
 * Seller dashboard: what the signed-in seller has for sale and the orders they
 * need to fulfil. Listings can be edited, paused or deleted; orders move through
 * placed → confirmed → shipped → delivered.
 */
export default function SellerDashboardScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('listings');

  const {
    status: listingStatus,
    listings,
    error: listingError,
    reload: reloadListings,
  } = useSellerListings();
  const {
    status: orderStatus,
    orders,
    error: orderError,
    reload: reloadOrders,
  } = useSellerOrders();

  const stats = useMemo(() => {
    const units = listings.reduce((sum, listing) => sum + listing.stockQty, 0);
    const live = listings.filter((listing) => listing.status === 'active').length;
    const outOfStock = listings.filter((listing) => listing.stockQty <= 0).length;
    const open = orders.filter((order) => order.status !== 'delivered' && order.status !== 'cancelled').length;
    return { units, live, outOfStock, open };
  }, [listings, orders]);

  const insights = useMemo(() => {
    const dayMs = 86_400_000;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();

    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(startMs - (6 - index) * dayMs);
      return {
        label: date
          .toLocaleDateString(locale === 'fr' ? 'fr-CM' : 'en-CM', { weekday: 'narrow' })
          .slice(0, 2),
        totalMinor: 0,
      };
    });

    let soldUnits = 0;
    let revenueMinor = 0;
    let weekMinor = 0;
    let liveOrders = 0;

    for (const order of orders) {
      if (order.status === 'cancelled') continue;
      liveOrders += 1;
      revenueMinor += order.sellerTotalMinor;
      soldUnits += order.items.reduce((sum, item) => sum + item.qty, 0);

      const placed = new Date(order.createdAt);
      if (Number.isNaN(placed.getTime())) continue;
      const index = Math.floor((placed.getTime() - startMs) / dayMs) + 6;
      if (index < 0 || index > 6) continue;
      buckets[index].totalMinor += order.sellerTotalMinor;
      weekMinor += order.sellerTotalMinor;
    }

    const maxMinor = Math.max(1, ...buckets.map((bucket) => bucket.totalMinor));

    return { buckets, maxMinor, soldUnits, revenueMinor, weekMinor, liveOrders };
  }, [orders]);

  const lowStock = useMemo(
    () =>
      listings.filter(
        (listing) => listing.stockQty > 0 && listing.stockQty <= LOW_STOCK_THRESHOLD,
      ),
    [listings],
  );

  const toggleListing = async (listing: SellerListing) => {
    try {
      await setListingStatus(listing.id, listing.status === 'active' ? 'inactive' : 'active');
      reloadListings();
    } catch (caught) {
      Alert.alert('Could not update listing', caught instanceof Error ? caught.message : 'Try again.');
    }
  };

  const confirmDelete = (listing: SellerListing) => {
    Alert.alert(
      'Delete listing?',
      `“${listing.title}” will be removed from your store. Buyers will no longer find it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteListing(listing.id);
              reloadListings();
            } catch (caught) {
              Alert.alert('Could not delete listing', caught instanceof Error ? caught.message : 'Try again.');
            }
          },
        },
      ],
    );
  };

  const advanceOrder = async (order: SellerOrder) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      await updateOrderStatus(order.id, next.status);
      reloadOrders();
    } catch (caught) {
      Alert.alert('Could not update order', caught instanceof Error ? caught.message : 'Try again.');
    }
  };

  if (!authLoading && !user) {
    return (
      <Screen>
        <EmptyState
          icon="store"
          title="Sign in to manage your store"
          message="Your listings and orders live with your Kiptrack account."
          actionLabel="Sign in"
          onAction={() => router.replace('/login')}
          secondaryLabel="Create an account"
          onSecondary={() => router.replace('/signup')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.six }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <ThemedText variant="title">Your store</ThemedText>
          <ThemedText variant="footnote" tone="textSecondary">
            {user?.email ?? 'Seller'} · {listings.length} {listings.length === 1 ? 'listing' : 'listings'}
          </ThemedText>
        </View>

        <View style={styles.stats}>
          <View style={[styles.stat, { borderColor: theme.border }]}>
            <ThemedText variant="title">{stats.live}</ThemedText>
            <ThemedText variant="footnote" tone="textSecondary">Live listings</ThemedText>
          </View>
          <View style={[styles.stat, { borderColor: theme.border }]}>
            <ThemedText variant="title">{stats.units}</ThemedText>
            <ThemedText variant="footnote" tone="textSecondary">Units in stock</ThemedText>
          </View>
          <View style={[styles.stat, { borderColor: theme.border }]}>
            <ThemedText variant="title">{stats.open}</ThemedText>
            <ThemedText variant="footnote" tone="textSecondary">Orders to fulfil</ThemedText>
          </View>
        </View>

        {stats.outOfStock > 0 ? (
          <ThemedText variant="footnote" tone="danger" style={styles.warning}>
            {stats.outOfStock} {stats.outOfStock === 1 ? 'listing is' : 'listings are'} out of stock and hidden from buyers.
          </ThemedText>
        ) : null}

        <View style={[styles.card, { borderColor: theme.border }]}>
          <View style={styles.cardHead}>
            <ThemedText variant="headline">Sales</ThemedText>
            <ThemedText variant="footnote" tone="textTertiary">Last 7 days</ThemedText>
          </View>

          <View style={styles.chart}>
            {insights.buckets.map((bucket, index) => {
              const share =
                bucket.totalMinor === 0
                  ? 0
                  : Math.max(6, (bucket.totalMinor / insights.maxMinor) * 100);
              return (
                <View key={index} style={styles.chartColumn}>
                  <View style={[styles.chartTrack, { backgroundColor: theme.skeleton }]}>
                    <View
                      style={[
                        styles.chartBar,
                        { height: `${share}%`, backgroundColor: theme.accentStrong },
                      ]}
                    />
                  </View>
                  <ThemedText variant="caption" tone="textTertiary">
                    {bucket.label}
                  </ThemedText>
                </View>
              );
            })}
          </View>

          <View style={styles.insightRow}>
            <View style={styles.insight}>
              <ThemedText variant="bodyStrong">{formatMoney(insights.weekMinor, locale)}</ThemedText>
              <ThemedText variant="footnote" tone="textSecondary">This week</ThemedText>
            </View>
            <View style={styles.insight}>
              <ThemedText variant="bodyStrong">{insights.soldUnits}</ThemedText>
              <ThemedText variant="footnote" tone="textSecondary">Units sold</ThemedText>
            </View>
            <View style={styles.insight}>
              <ThemedText variant="bodyStrong">{formatMoney(insights.revenueMinor, locale)}</ThemedText>
              <ThemedText variant="footnote" tone="textSecondary">All time</ThemedText>
            </View>
          </View>

          {insights.liveOrders === 0 ? (
            <ThemedText variant="footnote" tone="textTertiary">
              Sales appear here as soon as a buyer orders one of your items.
            </ThemedText>
          ) : null}
        </View>

        {lowStock.length > 0 ? (
          <View style={[styles.card, { borderColor: theme.border }]}>
            <View style={styles.cardHead}>
              <ThemedText variant="headline">Low stock</ThemedText>
              <ThemedText variant="footnote" tone="textTertiary">
                {lowStock.length} {lowStock.length === 1 ? 'listing' : 'listings'}
              </ThemedText>
            </View>
            {lowStock.map((listing) => (
              <View key={listing.id} style={styles.lowStockRow}>
                <View style={styles.lowStockText}>
                  <ThemedText variant="callout" numberOfLines={1}>
                    {listing.title}
                  </ThemedText>
                  <ThemedText variant="footnote" tone="danger">
                    {listing.stockQty} {listing.stockQty === 1 ? 'unit' : 'units'} left
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Restock ${listing.title}`}
                  hitSlop={8}
                  onPress={() => router.push({ pathname: '/sell', params: { id: listing.id } })}>
                  <ThemedText variant="footnote" tone="accentText">
                    Restock
                  </ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <PrimaryButton
          label="Sell a new item"
          onPress={() => router.push('/sell')}
          accessibilityHint="Upload a product for sale"
        />

        <SegmentedControl<Tab>
          accessibilityLabel="Seller sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'listings', label: `Listings (${listings.length})`, icon: 'store' },
            { value: 'orders', label: `Orders (${orders.length})`, icon: 'orders' },
          ]}
        />

        {tab === 'listings' ? (
          listingStatus === 'loading' ? (
            <LoadingState label="Loading your listings…" />
          ) : listingStatus === 'error' ? (
            <ErrorState
              title="Listings unavailable"
              message={
                listingError instanceof Error
                  ? listingError.message
                  : 'We could not load your listings.'
              }
              retryLabel="Try again"
              onRetry={reloadListings}
            />
          ) : listings.length === 0 ? (
            <EmptyState
              icon="store"
              title="Nothing for sale yet"
              message="Upload a product to put it in front of buyers."
              actionLabel="Sell an item"
              onAction={() => router.push('/sell')}
            />
          ) : (
            <View style={styles.list}>
              {listings.map((listing) => {
                const live = listing.status === 'active';
                return (
                  <View key={listing.id} style={[styles.row, { borderColor: theme.border }]}>
                    <ProductImage
                      uri={listing.images[0]}
                      seed={listing.id}
                      style={styles.thumb}
                      showMark={false}
                    />
                    <View style={styles.rowBody}>
                      <ThemedText variant="callout" numberOfLines={2}>
                        {listing.title}
                      </ThemedText>
                      <ThemedText variant="footnote" tone="textSecondary" numberOfLines={1}>
                        {listing.categoryName} · {listing.stockQty} in stock
                      </ThemedText>
                      <View style={styles.rowMeta}>
                        <ThemedText variant="price">{formatMoney(listing.priceMinor, locale)}</ThemedText>
                        <Badge label={live ? 'LIVE' : 'PAUSED'} tone={live ? 'accent' : 'neutral'} />
                      </View>
                      <View style={styles.rowActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${listing.title}`}
                          hitSlop={8}
                          onPress={() =>
                            router.push({ pathname: '/sell', params: { id: listing.id } })
                          }>
                          <ThemedText variant="footnote" tone="accentText">Edit</ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${live ? 'Pause' : 'Activate'} ${listing.title}`}
                          hitSlop={8}
                          onPress={() => toggleListing(listing)}>
                          <ThemedText variant="footnote" tone="textSecondary">
                            {live ? 'Pause' : 'Activate'}
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${listing.title}`}
                          hitSlop={8}
                          onPress={() => confirmDelete(listing)}>
                          <ThemedText variant="footnote" tone="danger">Delete</ThemedText>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )
        ) : orderStatus === 'loading' ? (
          <LoadingState label="Loading orders…" />
        ) : orderStatus === 'error' ? (
          <ErrorState
            title="Orders unavailable"
            message={orderError instanceof Error ? orderError.message : 'We could not load your orders.'}
            retryLabel="Try again"
            onRetry={reloadOrders}
          />
        ) : orders.length === 0 ? (
          <EmptyState
            icon="orders"
            title="No orders yet"
            message="When a buyer orders one of your items it shows up here."
          />
        ) : (
          <View style={styles.list}>
            {orders.map((order) => {
              const next = NEXT_STATUS[order.status];
              return (
                <View key={order.id} style={[styles.order, { borderColor: theme.border }]}>
                  <View style={styles.orderTop}>
                    <View style={styles.orderId}>
                      <ThemedText variant="callout">{order.reference}</ThemedText>
                      <ThemedText variant="footnote" tone="textTertiary">
                        {order.address.name} · {order.address.city}
                      </ThemedText>
                    </View>
                    <Badge
                      label={ORDER_STATUS_LABEL[order.status].toUpperCase()}
                      tone={order.status === 'placed' ? 'accent' : 'neutral'}
                    />
                  </View>

                  <View style={styles.orderItems}>
                    {order.items.map((item) => (
                      <ThemedText key={item.id} variant="footnote" tone="textSecondary" numberOfLines={2}>
                        {item.qty} × {item.title}
                      </ThemedText>
                    ))}
                  </View>

                  <View style={styles.orderFooter}>
                    <View style={styles.orderTotal}>
                      <ThemedText variant="footnote" tone="textTertiary">Your items</ThemedText>
                      <ThemedText variant="bodyStrong">{formatMoney(order.sellerTotalMinor, locale)}</ThemedText>
                    </View>
                    {next ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${next.label} order ${order.reference}`}
                        onPress={() => advanceOrder(order)}
                        style={({ pressed }) => [
                          styles.advance,
                          { backgroundColor: theme.primary, opacity: pressed ? 0.8 : 1 },
                        ]}>
                        <ThemedText variant="footnote" tone="onPrimary">{next.label}</ThemedText>
                      </Pressable>
                    ) : null}
                  </View>

                  <ThemedText variant="footnote" tone="textTertiary">
                    {order.address.phone} · Deliver to {order.address.name}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: ScreenPadding, gap: Spacing.three },
  intro: { gap: Spacing.one },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    gap: Spacing.half,
    alignItems: 'center',
  },
  warning: { textAlign: 'center' },
  card: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chartColumn: { flex: 1, alignItems: 'center', gap: Spacing.one },
  chartTrack: {
    width: '100%',
    height: 88,
    borderRadius: Radius.small,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  chartBar: { width: '100%', borderRadius: Radius.small },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  insight: { gap: Spacing.half },
  lowStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 44,
  },
  lowStockText: { flex: 1, gap: Spacing.half },
  list: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
  },
  thumb: { width: 72, height: 72, borderRadius: Radius.medium },
  rowBody: { flex: 1, gap: Spacing.half },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.half },
  rowActions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  order: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  orderTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  orderId: { gap: Spacing.half, flex: 1 },
  orderItems: { gap: Spacing.half },
  orderFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  orderTotal: { gap: Spacing.half },
  advance: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
