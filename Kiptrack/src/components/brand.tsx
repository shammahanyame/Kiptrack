import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-theme';

/**
 * The Kiptrack mark: an ink rounded square with the K glyph and the clay dot
 * from the brand sheet. Drawn with views so it stays crisp at any size and
 * needs no bitmap asset.
 */
export function BrandMark({ size = 40 }: { size?: number }) {
  const scheme = useResolvedScheme();
  const background = scheme === 'dark' ? '#F3F3F1' : Colors.light.text;
  const glyph = scheme === 'dark' ? Colors.light.text : '#FFFFFF';
  const dot = size * 0.115;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size * 0.3,
          backgroundColor: background,
        },
      ]}>
      <Text
        allowFontScaling={false}
        style={[
          styles.glyph,
          {
            color: glyph,
            fontSize: size * 0.66,
            lineHeight: size * 0.74,
          },
        ]}>
        K
      </Text>
      <View
        style={{
          position: 'absolute',
          top: size * 0.2,
          right: size * 0.19,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: Colors.light.accent,
        }}
      />
    </View>
  );
}

/** `kip` in ink, `track` in clay — matches the wordmark lockup. */
export function Wordmark({ size = 20 }: { size?: number }) {
  const scheme = useResolvedScheme();
  const inkColor = scheme === 'dark' ? '#F3F3F1' : Colors.light.text;

  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="kiptrack"
      style={[styles.wordmark, { fontSize: size, lineHeight: size * 1.25 }]}>
      <Text style={{ color: inkColor }}>kip</Text>
      <Text style={{ color: Colors.light.accent }}>track</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontWeight: '800',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  wordmark: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
