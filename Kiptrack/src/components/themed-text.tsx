import { StyleSheet, Text, type TextProps } from 'react-native';

import { Type, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = keyof typeof Type;

export type ThemedTextProps = TextProps & {
  variant?: TextVariant;
  /** Semantic color token. Defaults to the primary text color. */
  tone?: ThemeColor;
};

/**
 * Text primitive for the whole app. Dynamic Type is respected everywhere
 * because `allowFontScaling` stays at its default (true) — no fixed heights are
 * used around text so larger accessibility sizes reflow instead of clipping.
 */
export function ThemedText({
  style,
  variant = 'body',
  tone = 'text',
  ...rest
}: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[tone] }, Type[variant], style]} {...rest} />;
}

export const fontWeightStyles = StyleSheet.create({
  semibold: { fontWeight: '600' },
  bold: { fontWeight: '700' },
});
