import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ProductRow } from '@/components/product-card';
import { Screen, ScreenHeader } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useTheme } from '@/hooks/use-theme';
import { errorMessage } from '@/lib/catalog';
import { detectLocale } from '@/lib/format';
import { useSaved } from '@/state/saved';

const locale = detectLocale();

export default function SavedScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status, data, error, reload } = useCatalog(locale);
  const { ids, isSaved, toggle, clear, ready } = useSaved();

  // Saved ids keep their most-recent-first order; drop ones that are no longer
  // in the published catalogue.
  const savedProducts = useMemo(() => {
    const byId = new Map((data?.products ?? []).map((product) => [product.id, product]));
    return ids
      .map((id) => byId.get(id))
      .filter((product): product is NonNullable<typeof product> => Boolean(product));
  }, [ids, data]);

  const confirmClear = () => {
    Alert.alert(
      'Clear saved items?',
      'This removes every saved item from this device. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear all', style: 'destructive', onPress: clear },
      ]
    );
  };

  const count = savedProducts.length;
  const showList = ready && ids.length > 0;

  return (
    <Screen>
      <ScreenHeader
        title="Saved"
        subtitle={
          showList
            ? `${count} ${count === 1 ? 'item' : 'items'} · stored on this device`
            : 'Keep track of pieces you like'
        }
        right={
          showList ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all saved items"
              hitSlop={8}
              onPress={confirmClear}
              style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
              <ThemedText variant="footnote" tone="accentText">
                Clear
              </ThemedText>
            </Pressable>
          ) : null
        }
      />

      <FlatList
        data={showList ? savedProducts : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
        )}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            locale={locale}
            saved={isSaved(item.id)}
            onOpen={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
            onToggleSave={() => toggle(item.id)}
          />
        )}
        ListEmptyComponent={
          !ready ? (
            <LoadingState label="Opening your saved items…" />
          ) : status === 'loading' ? (
            <LoadingState label="Loading the catalogue…" />
          ) : status === 'error' ? (
            <ErrorState
              title="Saved items unavailable"
              message={errorMessage(error, locale)}
              retryLabel="Try again"
              onRetry={reload}
            />
          ) : ids.length > 0 ? (
            <SafeAreaView style={styles.filteredEmpty}>
              <EmptyState
                icon="savedOutline"
                title="These items are gone"
                message="The items you saved are no longer in the catalogue."
                actionLabel="Browse the catalogue"
                onAction={() => router.navigate('/')}
              />
            </SafeAreaView>
          ) : (
            <SafeAreaView style={styles.filteredEmpty}>
              <EmptyState
                icon="savedOutline"
                title="Nothing saved yet"
                message="Tap the heart on any item to keep it here for later."
                actionLabel="Browse the catalogue"
                onAction={() => router.navigate('/')}
              />
            </SafeAreaView>
          )
        }
        ListFooterComponent={
          showList ? (
            <View style={styles.footer}>
              <Icon name="info" size={14} color={theme.textTertiary} />
              <ThemedText variant="caption" tone="textTertiary" style={styles.footerText}>
                Saved items live on this device. Sign-in and cross-device sync arrive in Phase 2.
              </ThemedText>
            </View>
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: ScreenPadding - 12,
    paddingTop: Spacing.two,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 68 + Spacing.three,
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  pressed: {
    opacity: 0.6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
  },
  footerText: {
    flex: 1,
  },
  filteredEmpty: {
    paddingHorizontal: ScreenPadding,
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
});
