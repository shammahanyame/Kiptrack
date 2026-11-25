import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SecondaryButton } from '@/components/button';
import { SettingsGroup, SettingsRow, SegmentedControl } from '@/components/rows';
import { Screen, ScreenHeader } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useBuyerOrders } from '@/hooks/use-orders';
import { signOut } from '@/lib/auth';
import { useAuth } from '@/state/auth';
import { useCart } from '@/state/cart';
import { usePreferences, type SchemePreference } from '@/state/preferences';
import { useSaved } from '@/state/saved';

const version = Constants.expoConfig?.version ?? '1.0.0';

/**
 * Account tab. The single place a buyer or seller signs in, sees their orders
 * and cart, manages their store, changes appearance, and signs out.
 */
export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading } = useAuth();
  const { count } = useCart();
  const { orders } = useBuyerOrders();
  const { ids } = useSaved();
  const { preference, setPreference } = usePreferences();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (caught) {
      Alert.alert(
        'Could not sign out',
        caught instanceof Error ? caught.message : 'Something went wrong. Try again.',
      );
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never">
        <ScreenHeader
          title="Account"
          subtitle={user ? 'Your Kiptrack account' : 'Sign in to shop and sell'}
        />

        {!loading && !user ? (
          <View style={styles.cta}>
            <PrimaryButton
              label="Sign in"
              onPress={() => router.push('/login')}
              accessibilityHint="Sign in to your Kiptrack account"
            />
            <SecondaryButton label="Create an account" onPress={() => router.push('/signup')} />
          </View>
        ) : null}

        {user ? (
          <View style={styles.block}>
            <ThemedText variant="caption" tone="textSecondary" style={styles.groupLabel}>
              ACCOUNT
            </ThemedText>
            <SettingsGroup>
              <SettingsRow label="Signed in as" value={user.email ?? 'Kiptrack member'} />
              <SettingsRow label="Name" value={user.user_metadata?.name ?? 'Not set'} />
              <SettingsRow
                label="My orders"
                icon="orders"
                value={`${orders.length}`}
                accessibilityHint="Opens your order history"
                onPress={() => router.push('/orders')}
              />
              <SettingsRow
                label="Cart"
                icon="cart"
                value={`${count}`}
                accessibilityHint="Opens your cart"
                onPress={() => router.push('/cart')}
              />
              <SettingsRow
                label="Saved addresses"
                icon="pin"
                accessibilityHint="Manage your delivery addresses"
                onPress={() => router.push('/addresses')}
              />
              <SettingsRow
                label="Seller dashboard"
                icon="store"
                last
                accessibilityHint="Manage your listings and orders"
                onPress={() => router.push('/seller')}
              />
            </SettingsGroup>
          </View>
        ) : (
          <View style={styles.block}>
            <ThemedText variant="caption" tone="textSecondary" style={styles.groupLabel}>
              SHOPPING
            </ThemedText>
            <SettingsGroup>
              <SettingsRow
                label="Cart"
                icon="cart"
                value={`${count}`}
                accessibilityHint="Opens your cart"
                onPress={() => router.push('/cart')}
              />
              <SettingsRow
                label="Orders"
                icon="orders"
                value={`${orders.length}`}
                last
                accessibilityHint="Opens your order history"
                onPress={() => router.push('/orders')}
              />
            </SettingsGroup>
          </View>
        )}

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
            ABOUT
          </ThemedText>
          <SettingsGroup>
            <SettingsRow
              label="Notifications"
              icon="info"
              accessibilityHint="View your notifications"
              onPress={() => router.push('/notifications')}
            />
            <SettingsRow
              label="Help & support"
              icon="info"
              accessibilityHint="Contact support"
              onPress={() => router.push('/support')}
            />
            <SettingsRow label="Version" value={version} />
            <SettingsRow label="Saved items" icon="savedOutline" value={`${ids.length}`} last />
          </SettingsGroup>
        </View>

        {user ? (
          <View style={styles.block}>
            <SettingsGroup>
              <SettingsRow label="Sign out" destructive last onPress={handleSignOut} />
            </SettingsGroup>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four },
  cta: { gap: Spacing.two, paddingHorizontal: ScreenPadding },
  block: { gap: Spacing.two, paddingHorizontal: ScreenPadding },
  groupLabel: { paddingLeft: Spacing.one },
  helper: { paddingHorizontal: Spacing.one },
});
