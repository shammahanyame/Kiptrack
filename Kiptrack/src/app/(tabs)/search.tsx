import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/chip';
import { CategoryNav } from '@/components/category-nav';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ProductRow } from '@/components/product-card';
import { Screen, ScreenHeader } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Radius, ScreenPadding, Spacing, TouchTarget } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage, type Product } from '@/lib/catalog';
import { detectLocale } from '@/lib/format';
import { useSaved } from '@/state/saved';

const locale = detectLocale();

type SortKey = 'relevance' | 'price-asc' | 'price-desc' | 'newest';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'price-asc', label: 'Price: low to high' },
  { id: 'price-desc', label: 'Price: high to low' },
  { id: 'newest', label: 'Newest' },
];

/** Lower-cased, accent-folded text so "dante" finds "Danté". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function SearchScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { status, data, error, reload } = useCatalog(locale);
  const { isSaved, toggle } = useSaved();
  const params = useLocalSearchParams<{
    category?: string;
    q?: string;
    sort?: string;
    deals?: string;
    focus?: string;
  }>();

  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const [categoryId, setCategoryId] = useState<string | null>(
    typeof params.category === 'string' && params.category ? params.category : null,
  );
  const [sort, setSort] = useState<SortKey>(() => {
    const candidate = params.sort;
    if (
      candidate === 'relevance' ||
      candidate === 'price-asc' ||
      candidate === 'price-desc' ||
      candidate === 'newest'
    ) {
      return candidate;
    }
    return 'relevance';
  });
  const [inStockOnly, setInStockOnly] = useState(false);
  const [freeDeliveryOnly, setFreeDeliveryOnly] = useState(params.deals === '1');

  const RECENT_SEARCHES_KEY = 'kiptrack.recentSearches.v1';
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setRecentSearches(parsed.filter((v) => typeof v === 'string'));
      })
      .catch(() => {});
  }, []);

  const rememberSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((current) => {
      const next = [trimmed, ...current.filter((v) => v.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
      AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    AsyncStorage.removeItem(RECENT_SEARCHES_KEY).catch(() => {});
  };

  // Keep scoped navigation working when the params change while the screen
  // is already mounted (e.g. tapping another category tab).
  useEffect(() => {
    if (params.q !== undefined) setQuery(params.q);
  }, [params.q]);
  useEffect(() => {
    if (params.category !== undefined) setCategoryId(params.category || null);
  }, [params.category]);
  useEffect(() => {
    if (params.sort !== undefined) {
      const candidate = params.sort;
      if (
        candidate === 'relevance' ||
        candidate === 'price-asc' ||
        candidate === 'price-desc' ||
        candidate === 'newest'
      ) {
        setSort(candidate);
      }
    }
  }, [params.sort]);
  useEffect(() => {
    if (params.focus === '1') {
      const id = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [params.focus]);

  const products = useMemo(() => data?.products ?? [], [data]);
  const categories = useMemo(
    () => data?.categories.map((category) => ({ id: category.id, label: category.name })) ?? [],
    [data]
  );

  const results = useMemo(() => {
    const needle = fold(query);

    const filtered = products.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
      if (inStockOnly && product.stockQty <= 0) return false;
      if (freeDeliveryOnly && !product.isShippingFree) return false;
      if (!needle) return true;
      return (
        fold(product.title).includes(needle) ||
        fold(product.description).includes(needle) ||
        categories.some(
          (category) =>
            category.id === product.categoryId && fold(category.label).includes(needle)
        )
      );
    });

    switch (sort) {
      case 'price-asc':
        return [...filtered].sort((a, b) => a.priceMinor - b.priceMinor);
      case 'price-desc':
        return [...filtered].sort((a, b) => b.priceMinor - a.priceMinor);
      case 'newest':
        return [...filtered].sort((a, b) =>
          (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')
        );
      default:
        return filtered;
    }
  }, [products, categories, query, categoryId, sort, inStockOnly, freeDeliveryOnly]);

  const categoryName = (product: Product) =>
    categories.find((category) => category.id === product.categoryId)?.label;

  const openProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });
  const hasQuery = query.trim().length > 0;
  const filtersActive = hasQuery || categoryId !== null || inStockOnly || freeDeliveryOnly || sort !== 'relevance';

  const suggestions = useMemo(() => {
    const needle = fold(query);
    if (!needle || needle.length < 2) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const product of products) {
      if (fold(product.title).includes(needle) && !seen.has(product.title)) {
        seen.add(product.title);
        out.push(product.title);
        if (out.length >= 6) break;
      }
    }
    for (const category of categories) {
      if (fold(category.label).includes(needle) && !seen.has(category.label)) {
        seen.add(category.label);
        out.push(category.label);
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [products, categories, query]);

  const clearFilters = () => {
    setQuery('');
    setCategoryId(null);
    setInStockOnly(false);
    setFreeDeliveryOnly(false);
    setSort('relevance');
  };

  return (
    <Screen>
      <ScreenHeader
        title="Search"
        subtitle={
          status === 'ready'
            ? `${results.length} ${results.length === 1 ? 'item' : 'items'}`
            : undefined
        }
      />

      <CategoryNav
        categories={categories.map((category) => ({
          id: category.id,
          name: category.label,
          slug: category.id,
          parentId: null,
        }))}
        products={products}
        activeCategoryId={categoryId}
        onSelectCategory={setCategoryId}
      />

      <View style={styles.controls}>
        <View
          style={[
            styles.field,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}>
          <Icon name="search" size={18} color={theme.textTertiary} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search items, categories…"
            placeholderTextColor={theme.textTertiary}
            selectionColor={theme.accentStrong}
            cursorColor={theme.accentStrong}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            inputMode="search"
            accessibilityLabel="Search the catalogue"
            onSubmitEditing={() => {
              rememberSearch(query);
              inputRef.current?.blur();
            }}
            style={[styles.input, { color: theme.text }]}
          />
          {hasQuery ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={12}
              onPress={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              style={styles.clearButton}>
              <Icon name="close" size={16} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortRow}
          keyboardShouldPersistTaps="handled">
          {SORTS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              selected={sort === option.id}
              onPress={() => setSort(option.id)}
            />
          ))}
          <Chip
            label="In stock"
            selected={inStockOnly}
            onPress={() => setInStockOnly((value) => !value)}
          />
          <Chip
            label="Free delivery"
            selected={freeDeliveryOnly}
            onPress={() => setFreeDeliveryOnly((value) => !value)}
          />
        </ScrollView>
      </View>

      {status === 'ready' && !hasQuery && recentSearches.length > 0 ? (
        <View style={styles.suggestionBlock}>
          <View style={styles.suggestionHead}>
            <ThemedText variant="footnote" tone="textSecondary">
              Recent searches
            </ThemedText>
            <Pressable onPress={clearRecentSearches} hitSlop={8}>
              <ThemedText variant="caption" tone="accentText">
                Clear
              </ThemedText>
            </Pressable>
          </View>
          <View style={styles.chipWrap}>
            {recentSearches.map((term) => (
              <Chip
                key={term}
                label={term}
                selected={false}
                onPress={() => {
                  setQuery(term);
                  rememberSearch(term);
                }}
              />
            ))}
          </View>
        </View>
      ) : null}

      {status === 'ready' && hasQuery && suggestions.length > 0 ? (
        <View style={styles.suggestionBlock}>
          <ThemedText variant="footnote" tone="textSecondary" style={styles.suggestionHead}>
            Suggestions
          </ThemedText>
          {suggestions.map((term) => (
            <Pressable
              key={term}
              onPress={() => {
                setQuery(term);
                rememberSearch(term);
                inputRef.current?.blur();
              }}
              style={({ pressed }) => [styles.suggestionRow, pressed && styles.pressed]}>
              <Icon name="search" size={16} color={theme.textTertiary} />
              <ThemedText variant="body" numberOfLines={1} style={styles.suggestionText}>
                {term}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlatList
        data={status === 'ready' ? results : []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
        )}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            locale={locale}
            categoryName={categoryName(item)}
            saved={isSaved(item.id)}
            onOpen={() => openProduct(item.id)}
            onToggleSave={() => toggle(item.id)}
          />
        )}
        ListEmptyComponent={
          status === 'loading' ? (
            <LoadingState label="Loading the catalogue…" />
          ) : status === 'error' ? (
            <ErrorState
              title="Search unavailable"
              message={errorMessage(error, locale)}
              retryLabel="Try again"
              onRetry={reload}
            />
          ) : filtersActive ? (
            <EmptyState
              icon="searchOff"
              title="No matches"
              message={
                hasQuery
                  ? `Nothing matches “${query.trim()}” right now.`
                  : 'Nothing matches these filters right now.'
              }
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : (
            <EmptyState
              icon="search"
              title="Nothing to search yet"
              message="Items will appear here as sellers publish them."
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  field: {
    marginHorizontal: ScreenPadding,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  input: {
    flex: 1,
    minHeight: TouchTarget,
    fontSize: 17,
    paddingVertical: Spacing.one,
  },
  clearButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  chipRow: {
    marginHorizontal: -ScreenPadding,
  },
  sortRow: {
    gap: Spacing.two,
    paddingHorizontal: ScreenPadding,
  },
  list: {
    paddingHorizontal: ScreenPadding - 12,
    paddingTop: Spacing.one,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68 + Spacing.three,
  },
  suggestionBlock: {
    paddingHorizontal: ScreenPadding,
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  suggestionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  suggestionText: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
