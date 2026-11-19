import { SymbolView } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * One icon vocabulary for both platforms: SF Symbols on iOS (the native set),
 * Material Symbols on Android and web. Keeping the mapping in one place means
 * screens never hard-code platform-specific names.
 */
const ICONS = {
  home: { ios: 'house', android: 'home' },
  search: { ios: 'magnifyingglass', android: 'search' },
  saved: { ios: 'heart', android: 'favorite' },
  savedFilled: { ios: 'heart.fill', android: 'favorite' },
  savedOutline: { ios: 'heart', android: 'favorite_border' },
  settings: { ios: 'gearshape', android: 'settings' },
  back: { ios: 'chevron.left', android: 'arrow_back' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  close: { ios: 'xmark', android: 'close' },
  error: { ios: 'exclamationmark.triangle', android: 'error' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  store: { ios: 'storefront', android: 'storefront' },
  shipping: { ios: 'shippingbox', android: 'local_shipping' },
  verified: { ios: 'checkmark.seal', android: 'verified' },
  info: { ios: 'info.circle', android: 'info' },
  palette: { ios: 'paintpalette', android: 'palette' },
  sun: { ios: 'sun.max', android: 'light_mode' },
  moon: { ios: 'moon', android: 'dark_mode' },
  system: { ios: 'circle.lefthalf.filled', android: 'brightness_auto' },
  trash: { ios: 'trash', android: 'delete' },
  searchOff: { ios: 'magnifyingglass', android: 'search_off' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome' },
  cart: { ios: 'cart', android: 'shopping_cart' },
  orders: { ios: 'list.bullet.rectangle', android: 'receipt_long' },
  person: { ios: 'person', android: 'person' },
  plus: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  menu: { ios: 'line.3.horizontal', android: 'menu' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  chevronUp: { ios: 'chevron.up', android: 'expand_less' },
  pin: { ios: 'pin', android: 'keep' },
  eye: { ios: 'eye', android: 'visibility' },
  eyeOff: { ios: 'eye.slash', android: 'visibility_off' },
  mic: { ios: 'mic', android: 'mic' },
  arrowUp: { ios: 'arrow.up', android: 'arrow_upward' },
  arrowDown: { ios: 'arrow.down', android: 'arrow_downward' },
  tune: { ios: 'slider.horizontal.3', android: 'tune' },
  tag: { ios: 'tag', android: 'sell' },
  tshirt: { ios: 'tshirt', android: 'checkroom' },
  fork: { ios: 'fork.knife', android: 'restaurant' },
  bolt: { ios: 'bolt.fill', android: 'bolt' },
  book: { ios: 'book', android: 'menu_book' },
  leaf: { ios: 'leaf', android: 'eco' },
} as const;

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 20, color, style }: Props) {
  return (
    <SymbolView
      name={{ ios: ICONS[name].ios, android: ICONS[name].android }}
      size={size}
      tintColor={color}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
