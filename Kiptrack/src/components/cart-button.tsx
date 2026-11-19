import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useCart } from '@/state/cart';

/** Cart entry point for screen headers: a bag icon with the unit count. */
export function CartButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const { count } = useCart();
  const label = count > 0 ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart, empty';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens your cart"
      hitSlop={8}
      onPress={() => router.push('/cart')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}>
      <Icon name="cart" size={20} color={theme.text} />
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.accent }]}>
          <ThemedText variant="caption" tone="onAccent" style={styles.badgeText}>
            {count > 9 ? '9+' : String(count)}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 12, letterSpacing: 0 },
});
