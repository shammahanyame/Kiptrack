import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/product-card';
import { Screen, ScreenHeader } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { errorMessage, loadSellerProducts } from '@/lib/catalog';
import { detectLocale } from '@/lib/format';
import { useSaved } from '@/state/saved';

const locale = detectLocale();

/** Storefront for a single seller: every active listing they have. */
export default function SellerStoreScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isSaved, toggle } = useSaved();

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [products, setProducts] = useState<Awaited<ReturnType<typeof loadSellerProducts>>>([]);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    // Defer the loading flag so we never call setState synchronously in the effect body.
    queueMicrotask(() => {
      if (active) setStatus('loading');
    });
    loadSellerProducts(id)
      .then((data) => {
        if (!active) return;
        setProducts(data);
        setStatus('ready');
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [id]);

  const openProduct = (productId: string) =>
    router.push({ pathname: '/product/[id]', params: { id: productId } });

  return (
    <Screen>
      <ScreenHeader
        title="Seller's store"
        subtitle={
          status === 'ready'
            ? `${products.length} ${products.length === 1 ? 'item' : 'items'} for sale`
            : undefined
        }
      />
      <FlatList
        data={status === 'ready' ? products : []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        ListEmptyComponent={
          status === 'loading' ? (
            <LoadingState label="Loading this seller's items…" />
          ) : status === 'error' ? (
            <ErrorState
              title="Store unavailable"
              message={errorMessage(error, locale)}
              retryLabel="Try again"
              onRetry={() => {
                setStatus('loading');
                loadSellerProducts(id)
                  .then((data) => {
                    setProducts(data);
                    setStatus('ready');
                  })
                  .catch((caught) => {
                    setError(caught);
                    setStatus('error');
                  });
              }}
            />
          ) : (
            <EmptyState
              icon="store"
              title="Nothing for sale here yet"
              message="This seller has no active listings right now."
              actionLabel="Browse the catalogue"
              onAction={() => router.replace('/')}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <ProductCard
              product={item}
              locale={locale}
              saved={isSaved(item.id)}
              onOpen={() => openProduct(item.id)}
              onToggleSave={() => toggle(item.id)}
            />
          </View>
        )}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.three, paddingHorizontal: 0, paddingTop: Spacing.two },
  column: { gap: Spacing.three, paddingHorizontal: ScreenPadding },
  gridItem: { flex: 1, maxWidth: '50%' },
});
