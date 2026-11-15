import { router } from 'expo-router';
import { useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow } from '@/components/chip';
import { Icon } from '@/components/icon';
import { ProductRow } from '@/components/product-card';
import { Screen, ScreenHeader } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing, TouchTarget } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage, type Product } from '@/lib/catalog';
import { detectLocale } from '@/lib/format';
import { useSaved } from '@/state/saved';

const locale = detectLocale();

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
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const products = useMemo(() => data?.products ?? [], [data]);
  const categories = useMemo(
    () => data?.categories.map((category) => ({ id: category.id, label: category.name })) ?? [],
    [data]
  );

  const results = useMemo(() => {
    const needle = fold(query);
    return products.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
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
  }, [products, categories, query, categoryId]);

  const categoryName = (product: Product) =>
    categories.find((category) => category.id === product.categoryId)?.label;

  const openProduct = (id: string) => router.push({ pathname: '/product/[id]', params: { id } });
  const hasQuery = query.trim().length > 0;
  const filtersActive = hasQuery || categoryId !== null;

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
            onSubmitEditing={() => inputRef.current?.blur()}
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

        {categories.length > 0 ? (
          <View style={styles.chipRow}>
            <ChipRow
              items={categories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              allLabel="All"
            />
          </View>
        ) : null}
      </View>

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
                  : 'Nothing in this category yet.'
              }
              actionLabel="Clear filters"
              onAction={() => {
                setQuery('');
                setCategoryId(null);
              }}
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
  list: {
    paddingHorizontal: ScreenPadding - 12,
    paddingTop: Spacing.one,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68 + Spacing.three,
  },
});
