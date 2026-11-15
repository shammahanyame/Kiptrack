import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BrandMark } from '@/components/brand';
import { Radius } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-theme';

type Props = {
  uri?: string;
  /** Stable seed (usually the product id) so a product keeps its tint. */
  seed?: string;
  style?: StyleProp<ViewStyle>;
  /** Render the brand mark inside the placeholder. */
  showMark?: boolean;
  accessibilityLabel?: string;
};

/**
 * Product photography, with a branded placeholder underneath.
 *
 * Seed data currently points at `storage.example.com` URLs that never resolve,
 * so the placeholder is a first-class state rather than a broken grey box: a
 * warm gradient with the brand mark, tinted deterministically per product.
 */
const LIGHT_GRADIENTS = [
  ['#F3F3F1', '#E7DDD1'],
  ['#F5F1EC', '#E2D8CC'],
  ['#EFEEE9', '#DDD7CD'],
  ['#F4F1EA', '#E5DBD0'],
] as const;

const DARK_GRADIENTS = [
  ['#24252A', '#1A1B1F'],
  ['#262321', '#1A1917'],
  ['#232428', '#181A1D'],
  ['#252423', '#1A1918'],
] as const;

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return hash;
}

export function ProductImage({ uri, seed = 'kiptrack', style, showMark = true, accessibilityLabel }: Props) {
  const scheme = useResolvedScheme();
  const [failed, setFailed] = useState(false);
  const palette = (scheme === 'dark' ? DARK_GRADIENTS : LIGHT_GRADIENTS)[
    hashSeed(seed) % 4
  ];

  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={palette}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {showMark ? (
        <View style={styles.markWrap} pointerEvents="none">
          <BrandMark size={36} />
        </View>
      ) : null}

      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={seed}
          accessibilityLabel={accessibilityLabel}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: Radius.large,
    backgroundColor: '#F3F3F1',
  },
  markWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
});
