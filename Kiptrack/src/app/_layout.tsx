import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';

import { SplashOverlay } from '@/components/splash-overlay';
import { Colors } from '@/constants/theme';
import { useResolvedScheme } from '@/hooks/use-theme';
import { PreferencesProvider } from '@/state/preferences';
import { SavedProvider } from '@/state/saved';

// Keep the native splash up until the first frame has laid out, then let
// SplashOverlay fade the branded version out.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  return (
    <PreferencesProvider>
      <SavedProvider>
        <RootNavigator />
      </SavedProvider>
    </PreferencesProvider>
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
