import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { BrandMark, Wordmark } from '@/components/brand';

const INK = '#121316';

/**
 * Holds the native splash until the JS tree has laid out, then fades a branded
 * overlay out. With Reduce Motion enabled it cuts straight to the app instead of
 * animating.
 */
export function SplashOverlay() {
  const [gone, setGone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const started = useRef(false);
  const reduceMotion = useReducedMotion();

  const onLayout = useCallback(() => {
    if (started.current) return;
    started.current = true;

    SplashScreen.hideAsync().finally(() => {
      if (reduceMotion) {
        setGone(true);
        return;
      }
      Animated.timing(opacity, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setGone(true);
      });
    });
  }, [opacity, reduceMotion]);

  if (gone) return null;

  return (
    <Animated.View pointerEvents="none" onLayout={onLayout} style={[styles.overlay, { opacity }]}>
      <View style={styles.lockup}>
        <BrandMark size={72} />
        <Wordmark size={26} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  lockup: {
    alignItems: 'center',
    gap: 18,
  },
});
