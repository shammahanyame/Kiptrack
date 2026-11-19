import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { FlatList, SafeAreaView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Badge } from '@/components/chip';
import { CategoryNav } from '@/components/category-nav';
import { Icon } from '@/components/icon';
import { ProductImage } from '@/components/product-image';
import { ProductCard, SaveButton } from '@/components/product-card';
import { Wordmark } from '@/components/brand';
import { CartButton } from '@/components/cart-button';
import { Screen, ScreenHeader, SectionHeader } from '@/components/screen';
import { ErrorState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/catalog';
import { detectLocale, formatMoney, formatStock, truncate } from '@/lib/format';
import { useRecent } from '@/state/recent';
import { useSaved } from '@/state/saved';

const locale = detectLocale();

export default function BrowseScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status, data, error, refreshing, refresh, reload } = useCatalog(locale);
  const { isSaved, toggle } = useSaved();
  const { ids: recentIds } = useRecent();
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const products = useMemo(() => data?.products ?? [], [data]);
  const recentProducts = useMemo(() => {
    const byId = new Map(products.map((product) => [product.id, product]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((product): product is NonNullable<typeof product> => Boolean(product))
      .slice(0, 8);
  }, [recentIds, products]);
  const categories = useMemo(() => data?.categories ?? [], [data]);

  const filtered = useMemo(
    () =>
      categoryId ? products.filter((product) => product.categoryId === categoryId) : products,
    [products, categoryId]
  );

  // Only promote the spotlight when the whole catalogue is showing, so a
  // category filter never hides the item the user just filtered for.
  const spotlight = categoryId === null ? (filtered.find((product) => product.featured) ?? null) : null;
  const gridItems = spotlight ? filtered.filter((product) => product.id !== spotlight.id) : filtered;

  const openProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });

  const header = (
    <SafeAreaView style={styles.header}>
      <ScreenHeader
        eyebrow={<Wordmark size={19} />}
        title="Browse"
        subtitle="Curated pieces from Kiptrack sellers"
        right={<CartButton />}
      />

      <CategoryNav
        categories={categories}
        products={products}
        activeCategoryId={categoryId}
        onSelectCategory={setCategoryId}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search the catalogue"
        accessibilityHint="Opens search"
        onPress={() => router.navigate('/search')}
        style={({ pressed }) => [
          styles.searchField,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}>
        <Icon name="search" size={18} color={theme.textTertiary} />
        <ThemedText variant="body" tone="textTertiary" numberOfLines={1}>
          Search items, categories…
        </ThemedText>
      </Pressable>

      {status === 'ready' ? (
        <>
          {spotlight ? (
            <View style={styles.spotlight}>
              <SectionHeader title="Spotlight" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${spotlight.title}, ${formatMoney(spotlight.priceMinor, locale)}`}
                accessibilityHint="Opens the item"
                onPress={() => openProduct(spotlight.id)}
                style={({ pressed }) => [styles.hero, pressed && styles.pressed]}>
                <View>
                  <ProductImage
                    uri={spotlight.images[0]}
                    seed={spotlight.id}
                    style={styles.heroImage}
                    accessibilityLabel={spotlight.title}
                  />
                  <View style={styles.heroBadge}>
                    <Badge label="FEATURED" tone="accent" />
                  </View>
                  <SaveButton
                    saved={isSaved(spotlight.id)}
                    onPress={() => toggle(spotlight.id)}
                    label={
                      isSaved(spotlight.id)
                        ? `Remove ${spotlight.title} from saved`
                        : `Save ${spotlight.title}`
                    }
                    style={styles.heroSave}
                  />
                </View>
                <View style={styles.heroBody}>
                  <ThemedText variant="headline" numberOfLines={2}>
                    {truncate(spotlight.title, 70)}
                  </ThemedText>
                  <View style={styles.heroMeta}>
                    <ThemedText variant="price" tone="text">
                      {formatMoney(spotlight.priceMinor, locale)}
                    </ThemedText>
                    <ThemedText variant="footnote" tone="textSecondary">
                      {formatStock(spotlight.stockQty, locale)}
                    </ThemedText>
                  </View>
                </View>
              </Pressable>
            </View>
          ) : null}

          {recentProducts.length > 0 ? (
            <View style={styles.recent}>
              <SectionHeader title="Recently viewed" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentRow}>
                {recentProducts.map((recent) => (
                  <View key={recent.id} style={styles.recentItem}>
                    <ProductCard
                      product={recent}
                      locale={locale}
                      saved={isSaved(recent.id)}
                      onOpen={() => openProduct(recent.id)}
                      onToggleSave={() => toggle(recent.id)}
                    />
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <SectionHeader
            title={spotlight ? 'More items' : 'All items'}
            action={
              <ThemedText variant="footnote" tone="textTertiary">
                {gridItems.length} {gridItems.length === 1 ? 'item' : 'items'}
              </ThemedText>
            }
            style={styles.sectionSpacing}
          />
        </>
      ) : null}
    </SafeAreaView>
  );

  return (
    <Screen>
      <FlatList
        data={status === 'ready' ? gridItems : []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={header}
        ListEmptyComponent={
          status === 'loading' ? (
            <LoadingState label='Loading the catalogue...' />
          ) : status === 'error' ? (
            <ErrorState
              title='Catalogue unavailable'
              message={errorMessage(error, locale)}
              retryLabel='Try again'
              onRetry={reload}
            />
          ) : categoryId ? (
            <SafeAreaView style={styles.filteredEmpty}>
              <ThemedText variant='body' tone='textSecondary' style={styles.center}>
                Nothing in this category yet.
              </ThemedText>
              <Pressable
                accessibilityRole='button'
                accessibilityLabel='Show all items'
                onPress={() => setCategoryId(null)}
                style={styles.clearFilter}>
                <ThemedText variant='bodyStrong' tone='accentText'>
                  Show all items
                </ThemedText>
              </Pressable>
            </SafeAreaView>
          ) : (
            <SafeAreaView style={styles.filteredEmpty}>
              <ThemedText variant='body' tone='textSecondary' style={styles.center}>
                No items are published yet. Check back soon.
              </ThemedText>
            </SafeAreaView>
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
        refreshControl={
          status === 'ready' ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={theme.accentStrong}
              colors={[theme.accentStrong]}
              progressBackgroundColor={theme.surface}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.three,
  },
  searchField: {
    marginHorizontal: ScreenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  chipRow: {
    marginHorizontal: -ScreenPadding,
  },
  spotlight: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  hero: {
    marginHorizontal: ScreenPadding,
    gap: Spacing.two,
  },
  heroImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.xlarge,
  },
  heroBadge: {
    position: 'absolute',
    top: Spacing.three,
    left: Spacing.three,
  },
  heroSave: {
    position: 'absolute',
    top: Spacing.three,
    right: Spacing.three,
  },
  heroBody: {
    gap: Spacing.one,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  recent: {
    gap: Spacing.two,
  },
  recentRow: {
    gap: Spacing.three,
    paddingHorizontal: ScreenPadding,
    paddingVertical: Spacing.one,
  },
  recentItem: {
    width: 148,
  },
  sectionSpacing: {
    paddingHorizontal: ScreenPadding,
    marginTop: Spacing.one,
  },
  column: {
    gap: Spacing.three,
    paddingHorizontal: ScreenPadding,
  },
  gridItem: {
    flex: 1,
    maxWidth: '50%',
  },
  filteredEmpty: {
    paddingHorizontal: ScreenPadding,
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  center: {
    textAlign: 'center',
  },
  clearFilter: {
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
});
