import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/brand';
import { SettingsGroup, SettingsRow, SegmentedControl } from '@/components/rows';
import { Screen, ScreenHeader } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { isSupabaseConfigured } from '@/lib/supabase';
import { detectLocale } from '@/lib/format';
import { usePreferences, type SchemePreference } from '@/state/preferences';
import { useSaved } from '@/state/saved';

const locale = detectLocale();
const version = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { preference, setPreference } = usePreferences();
  const { ids, clear } = useSaved();
  const { status, data, refreshing, refresh } = useCatalog(locale);

  const itemCount = data?.products.length ?? 0;

  const confirmClear = () => {
    Alert.alert('Clear saved items?', 'This removes every saved item from this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: clear },
    ]);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never">
        <ScreenHeader title="Settings" subtitle="Make Kiptrack yours" />

        <View style={styles.block}>
          <ThemedText variant="caption" tone="textSecondary" style={styles.groupLabel}>
            APPEARANCE
          </ThemedText>
          <SegmentedControl<SchemePreference>
            accessibilityLabel="Appearance"
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: 'System', icon: 'system' },
              { value: 'light', label: 'Light', icon: 'sun' },
              { value: 'dark', label: 'Dark', icon: 'moon' },
            ]}
          />
          <ThemedText variant="footnote" tone="textTertiary" style={styles.helper}>
            {preference === 'system'
              ? 'Follows your device appearance setting.'
              : `Always uses the ${preference} appearance.`}
          </ThemedText>
        </View>

        <View style={styles.block}>
          <ThemedText variant="caption" tone="textSecondary" style={styles.groupLabel}>
            CATALOGUE
          </ThemedText>
          <SettingsGroup>
            <SettingsRow
              label="Refresh catalogue"
              icon="refresh"
              value={refreshing ? 'Refreshing…' : status === 'error' ? 'Offline' : 'Up to date'}
              busy={refreshing}
              accessibilityHint="Fetches the latest items from Kiptrack"
              onPress={refresh}
            />
            <SettingsRow
              label="Items available"
              icon="store"
              value={status === 'ready' ? `${itemCount}` : '—'}
            />
            <SettingsRow
              label="Saved items"
              icon="savedOutline"
              value={`${ids.length}`}
              last={ids.length === 0}
              accessibilityHint="Opens your saved items"
              onPress={() => router.navigate('/saved')}
            />
            {ids.length > 0 ? (
              <SettingsRow
                label="Clear saved items"
                icon="trash"
                destructive
                last
                onPress={confirmClear}
              />
            ) : null}
          </SettingsGroup>
        </View>

        <View style={styles.block}>
          <ThemedText variant="caption" tone="textSecondary" style={styles.groupLabel}>
            ABOUT
          </ThemedText>
          <SettingsGroup>
            <SettingsRow label="Version" value={version} />
            <SettingsRow
              label="Catalogue"
              value={isSupabaseConfigured ? 'Live · Supabase' : 'Not configured'}
            />
            <SettingsRow
              label="Platform"
              value={Platform.select({ ios: 'iOS', android: 'Android', default: 'Web' })}
              last
            />
          </SettingsGroup>
          <ThemedText variant="footnote" tone="textTertiary" style={styles.helper}>
            Kiptrack is in preview. Accounts, checkout and seller tools arrive in Phase 2.
          </ThemedText>
        </View>

        <View style={styles.footer}>
          <BrandMark size={36} />
          <ThemedText variant="caption" tone="textTertiary">
            KIPTRACK · YAOUNDÉ
          </ThemedText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.four,
  },
  block: {
    gap: Spacing.two,
    paddingHorizontal: ScreenPadding,
  },
  groupLabel: {
    paddingLeft: Spacing.one,
  },
  helper: {
    paddingHorizontal: Spacing.one,
  },
  footer: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
});
