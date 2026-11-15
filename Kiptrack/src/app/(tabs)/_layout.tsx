import { NativeTabs } from 'expo-router/native-tabs';

import { useResolvedScheme, useTheme } from '@/hooks/use-theme';
import { detectLocale } from '@/lib/format';

const locale = detectLocale();

const LABELS = {
  en: { home: 'Home', search: 'Search', saved: 'Saved', settings: 'Settings' },
  fr: { home: 'Accueil', search: 'Rechercher', saved: 'Enregistrés', settings: 'Réglages' },
} as const;

/**
 * Platform-native tab bar: `sf` renders SF Symbols on iOS (including the iOS 26
 * liquid-glass tab bar) and `md` renders Material Symbols on Android.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const scheme = useResolvedScheme();
  const copy = LABELS[locale];

  return (
    <NativeTabs
      tintColor={theme.tabActive}
      iconColor={theme.tabInactive}
      backgroundColor={theme.background}
      badgeBackgroundColor={theme.accent}
      shadowColor={scheme === 'dark' ? theme.border : undefined}
      labelStyle={{
        default: { color: theme.tabInactive, fontSize: 11 },
        selected: { color: theme.tabActive, fontSize: 11, fontWeight: '600' },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{copy.home}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>{copy.search}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="saved">
        <NativeTabs.Trigger.Label>{copy.saved}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} md="favorite" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{copy.settings}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gearshape', selected: 'gearshape.fill' }}
          md="settings"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
