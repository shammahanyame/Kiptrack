import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SecondaryButton } from '@/components/button';
import { FormField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { loadProduct, loadProductCategories } from '@/lib/catalog';
import { loadDeliveryAddress, saveDeliveryAddress } from '@/lib/delivery';
import { detectLocale, formatMoney } from '@/lib/format';
import { placeOrder, type OrderAddress } from '@/lib/orders';
import { useAuth } from '@/state/auth';
import { cartLineKey, useCart, type CartLine } from '@/state/cart';
import { useNav } from '@/state/nav';

const locale = detectLocale();

/**
 * Checkout. Collects delivery details, writes the order and its lines to
 * Supabase, then opens the order so the buyer can follow it.
 *
 * Arriving with `?buyNow=<productId>` orders that single item and leaves the
 * cart untouched — the storefront's "Buy now" path.
 */
export default function CheckoutScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { buyNow } = useLocalSearchParams<{ buyNow?: string }>();
  const { user } = useAuth();
  const { recordPurchase } = useNav();
  const {
    lines: cartLines,
    subtotalMinor: cartSubtotalMinor,
    count: cartCount,
    clear,
  } = useCart();

  const [name, setName] = useState<string>(user?.user_metadata?.name ?? '');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [buyNowLine, setBuyNowLine] = useState<CartLine | null>(null);
  const [buyNowError, setBuyNowError] = useState('');
  const [buyNowAttempt, setBuyNowAttempt] = useState(0);

  // Remember where the last order went, so repeat buyers only type it once.
  useEffect(() => {
    let active = true;
    loadDeliveryAddress().then((saved) => {
      if (!active || !saved) return;
      if (saved.name) setName((current) => current || saved.name || '');
      if (saved.phone) setPhone((current) => current || saved.phone || '');
      if (saved.city) setCity((current) => current || saved.city || '');
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!buyNow) {
      setBuyNowLine(null);
      setBuyNowError('');
      return;
    }

    const controller = new AbortController();
    let active = true;
    setBuyNowLine(null);
    setBuyNowError('');

    loadProduct(buyNow, controller.signal)
      .then((product) => {
        if (!active) return;
        if (!product) {
          setBuyNowError('This item is no longer available.');
          return;
        }
        setBuyNowLine({
          product: product.id,
          sku: product.id,
          title: product.title,
          priceMinor: product.priceMinor,
          image: product.images[0],
          qty: 1,
          selectedOptions: {},
        });
      })
      .catch(() => {
        if (active) setBuyNowError('We could not prepare this item. Try again.');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [buyNow, buyNowAttempt]);

  if (!user) {
    return (
      <Screen>
        <EmptyState
          icon="person"
          title="Sign in to check out"
          message="Your order needs an account so the seller can reach you."
          actionLabel="Sign in"
          onAction={() => router.replace({ pathname: '/login', params: { next: 'checkout' } })}
          secondaryLabel="Create an account"
          onSecondary={() => router.replace({ pathname: '/signup', params: { next: 'checkout' } })}
        />
      </Screen>
    );
  }

  if (buyNow && buyNowError) {
    return (
      <Screen>
        <ErrorState
          title="Item unavailable"
          message={buyNowError}
          retryLabel="Try again"
          onRetry={() => setBuyNowAttempt((value) => value + 1)}
        />
      </Screen>
    );
  }

  if (buyNow && !buyNowLine) {
    return (
      <Screen>
        <LoadingState label="Preparing your order…" />
      </Screen>
    );
  }

  const lines = buyNowLine ? [buyNowLine] : cartLines;
  const count = buyNowLine ? buyNowLine.qty : cartCount;
  const subtotalMinor = buyNowLine ? buyNowLine.priceMinor * buyNowLine.qty : cartSubtotalMinor;

  if (lines.length === 0) {
    return (
      <Screen>
        <EmptyState
          icon="cart"
          title="Nothing to check out"
          message="Add an item to your cart first."
          actionLabel="Browse the catalogue"
          onAction={() => router.replace('/')}
        />
      </Screen>
    );
  }

  const submit = async () => {
    setError('');
    if (!name.trim()) return setError('Enter the name the delivery is for.');
    if (phone.replace(/\D/g, '').length < 8) return setError('Enter a reachable phone number.');
    if (!city.trim()) return setError('Enter your city or town.');

    const address: OrderAddress = {
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim(),
      notes: notes.trim() || undefined,
    };

    setBusy(true);
    try {
      const order = await placeOrder(
        lines.map((line) => ({
          product: line.product,
          sku: line.sku,
          title: line.title,
          priceMinor: line.priceMinor,
          qty: line.qty,
          image: line.image,
        })),
        address,
      );

      await saveDeliveryAddress(address);

      // Orders teach the category bar what this shopper buys; never block on it.
      loadProductCategories(lines.map((line) => line.product))
        .then(recordPurchase)
        .catch(() => {});

      if (!buyNowLine) clear();
      router.replace({ pathname: '/orders/[id]', params: { id: order.id } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not place your order.');
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
        <View style={styles.section}>
          <ThemedText variant="headline" accessibilityRole="header">
            Delivery details
          </ThemedText>
          <FormField
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Who is receiving the order?"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
          <FormField
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 6 70 00 00 00"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="next"
          />
          <FormField
            label="City or town"
            value={city}
            onChangeText={setCity}
            placeholder="e.g. Yaoundé"
            autoCapitalize="words"
            returnKeyType="next"
          />
          <FormField
            label="Delivery notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Landmarks, preferred time, anything the seller should know."
            multiline
            textAlignVertical="top"
            maxLength={400}
          />
        </View>

        <View style={[styles.summary, { borderColor: theme.border }]}>
          <ThemedText variant="headline" accessibilityRole="header">
            Order summary
          </ThemedText>

          {buyNowLine ? (
            <ThemedText variant="footnote" tone="textSecondary">
              Buying this item now. Your cart stays exactly as it is.
            </ThemedText>
          ) : null}

          {lines.map((line) => (
            <View key={cartLineKey(line)} style={styles.row}>
              <ThemedText variant="footnote" tone="textSecondary" numberOfLines={2} style={styles.itemName}>
                {line.qty} × {line.title}
              </ThemedText>
              <ThemedText variant="footnote">
                {formatMoney(line.priceMinor * line.qty, locale)}
              </ThemedText>
            </View>
          ))}

          <View style={[styles.divider, { backgroundColor: theme.border }]} />

          <View style={styles.row}>
            <ThemedText variant="bodyStrong">
              Total · {count} {count === 1 ? 'item' : 'items'}
            </ThemedText>
            <ThemedText variant="bodyStrong">{formatMoney(subtotalMinor, locale)}</ThemedText>
          </View>

          <ThemedText variant="footnote" tone="textTertiary">
            Delivery is arranged directly with the seller after the order is placed.
          </ThemedText>
        </View>

        {error ? (
          <ThemedText variant="footnote" tone="danger" accessibilityRole="alert" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton
            label={`Place order · ${formatMoney(subtotalMinor, locale)}`}
            onPress={submit}
            busy={busy}
          />
          <SecondaryButton label={buyNowLine ? 'Back' : 'Back to cart'} onPress={() => router.back()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: ScreenPadding, gap: Spacing.four },
  section: { gap: Spacing.three },
  summary: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: Radius.large,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  itemName: { flex: 1 },
  divider: { height: StyleSheet.hairlineWidth },
  actions: { gap: Spacing.two },
  error: { textAlign: 'center' },
});
