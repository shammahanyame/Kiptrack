import { Pressable, StyleSheet, View } from 'react-native';

type CardVariant = 'grid' | 'row';

import { Icon } from '@/components/icon';
import { ProductImage } from '@/components/product-image';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { formatMoney, formatStock, truncate, type Locale } from '@/lib/format';
import type { Product } from '@/lib/catalog';
import { useTheme } from '@/hooks/use-theme';

type SaveButtonProps = {
  saved: boolean;
  onPress: () => void;
  label: string;
  style?: object;
};

/** Circular heart toggle that stays a comfortable target on a photo. */
export function SaveButton({ saved, onPress, label, style }: SaveButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: saved }}
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [
        styles.saveButton,
        {
          backgroundColor: theme.surfaceRaised,
          borderColor: theme.border,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}>
      <Icon
        name={saved ? 'savedFilled' : 'savedOutline'}
        size={18}
        color={saved ? theme.accentStrong : theme.textSecondary}
      />
    </Pressable>
  );
}

type GridCardProps = {
  product: Product;
  locale: Locale;
  saved: boolean;
  onOpen: () => void;
  onToggleSave: () => void;
  variant?: CardVariant;
};

/** Two-column catalogue tile. */
export function ProductCard({
  product,
  locale,
  saved,
  onOpen,
  onToggleSave,
  variant = 'grid',
}: GridCardProps) {
  const price = formatMoney(product.priceMinor, locale);
  const soldOut = product.stockQty <= 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${price}`}
      accessibilityHint="Opens the item"
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View>
        <ProductImage
          uri={product.images[0]}
          seed={product.id}
          style={styles.cardImage}
          accessibilityLabel={product.title}
        />
        <SaveButton
          saved={saved}
          onPress={onToggleSave}
          label={saved ? `Remove ${product.title} from saved` : `Save ${product.title}`}
          style={styles.cardSave}
        />
      </View>

      <View style={styles.cardBody}>
        <ThemedText variant="callout" numberOfLines={2} style={styles.cardTitle}>
          {truncate(product.title, 60)}
        </ThemedText>
        <ThemedText variant="price" style={styles.numeric}>
          {price}
        </ThemedText>
        <ThemedText variant="footnote" tone={soldOut ? 'danger' : 'textTertiary'} numberOfLines={1}>
          {formatStock(product.stockQty, locale)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

type RowProps = GridCardProps & { categoryName?: string };

/** Single-line result row used by Search and Saved. */
export function ProductRow({ product, locale, saved, onOpen, onToggleSave, categoryName }: RowProps) {
  const theme = useTheme();
  const price = formatMoney(product.priceMinor, locale);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.title}, ${price}`}
      accessibilityHint="Opens the item"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.surface : 'transparent' },
      ]}>
      <ProductImage uri={product.images[0]} seed={product.id} style={styles.rowImage} showMark={false} />

      <View style={styles.rowBody}>
        <ThemedText variant="callout" numberOfLines={2}>
          {truncate(product.title, 70)}
        </ThemedText>
        <ThemedText variant="price" tone="text" style={styles.numeric}>
          {price}
        </ThemedText>
        <ThemedText variant="footnote" tone="textTertiary" numberOfLines={1}>
          {categoryName ? `${categoryName} · ` : ''}
          {formatStock(product.stockQty, locale)}
        </ThemedText>
      </View>

      <SaveButton
        saved={saved}
        onPress={onToggleSave}
        label={saved ? `Remove ${product.title} from saved` : `Save ${product.title}`}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: Spacing.one,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.large,
  },
  cardSave: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
  },
  cardBody: {
    gap: 2,
    paddingTop: Spacing.one,
  },
  cardTitle: {
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    minHeight: TouchTarget + 32,
    borderRadius: Radius.medium,
  },
  rowImage: {
    width: 68,
    height: 68,
    borderRadius: Radius.medium,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  saveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  numeric: {
    fontVariant: ['tabular-nums'],
  },
});
