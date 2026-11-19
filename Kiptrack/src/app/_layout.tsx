import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { SplashOverlay } from '@/components/splash-overlay';
import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-theme';
import { AuthProvider } from '@/state/auth';
import { CartProvider } from '@/state/cart';
import { NavProvider } from '@/state/nav';
import { RecentProvider } from '@/state/recent';
import { PreferencesProvider } from '@/state/preferences';
import { SavedProvider } from '@/state/saved';

// Keep the native splash up until the first frame has laid out, then let
// SplashOverlay fade the branded version out.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <NavProvider>
          <SavedProvider>
            <CartProvider>
            <RecentProvider>
              <RootNavigator />
            </RecentProvider>
          </CartProvider>
          </SavedProvider>
        </NavProvider>
      </PreferencesProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const scheme = useResolvedScheme();
  const theme = Colors[scheme];

  useEffect(() => {
    // Matches the Android window background to the app surface so there is no
    // white flash behind the edge-to-edge system bars.
    SystemUI.setBackgroundColorAsync(theme.background).catch(() => {});
  }, [theme.background]);

  const navigationTheme = useMemo(
    () => ({
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
      colors: {
        ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
        primary: theme.accentStrong,
        background: theme.background,
        card: theme.background,
        text: theme.text,
        border: theme.border,
        notification: theme.accent,
      },
    }),
    [scheme, theme]
  );

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SplashOverlay />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="sell" options={{ headerShown: false }} />
        <Stack.Screen
          name="cart"
          options={{
            headerShown: true,
            title: 'Cart',
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerTintColor: theme.text,
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Stack.Screen
          name="orders"
          options={{
            headerShown: true,
            title: 'Orders',
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerTintColor: theme.text,
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Stack.Screen
          name="orders/[id]"
          options={{
            headerShown: true,
            title: 'Order',
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerTintColor: theme.text,
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Stack.Screen
          name="reviews/[id]"
          options={{
            headerShown: true,
            title: 'Reviews',
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerTintColor: theme.text,
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Stack.Screen
          name="seller"
          options={{
            headerShown: true,
            title: 'Seller',
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerTintColor: theme.text,
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Stack.Screen
          name="checkout"
          options={{
            headerShown: true,
            title: 'Checkout',
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerTintColor: theme.text,
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
        <Stack.Screen
          name="product/[id]"
          options={{
            headerShown: true,
            title: '',
            headerStyle: { backgroundColor: theme.background },
            headerShadowVisible: false,
            headerTintColor: theme.text,
            headerBackButtonDisplayMode: 'minimal',
            // iOS presents item details as a card push; Android keeps the
            // standard Material vertical transition.
            animation: Platform.select({ ios: 'default', default: 'slide_from_right' }),
            // Rounded corners are not a Material pattern.
            ...(Platform.OS === 'ios' ? { contentStyle: { backgroundColor: theme.background } } : null),
          }}
        />
        <Stack.Screen
          name="+not-found"
          options={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}
        />
      </Stack>
    </ThemeProvider>
  );
}

export const unstable_settings = {
  initialRouteName: '(tabs)',
};
