import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand';
import { PrimaryButton, SecondaryButton } from '@/components/button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <Screen>
      <View style={styles.container}>
        <BrandMark size={56} />
        <ThemedText variant="caption" tone="textTertiary">
          404
        </ThemedText>
        <ThemedText variant="title" style={styles.center}>
          This page isn’t in the catalogue
        </ThemedText>
        <ThemedText variant="body" tone="textSecondary" style={styles.center}>
          The link may be outdated, or the item has been removed.
        </ThemedText>

        <View style={styles.actions}>
          <PrimaryButton label="Back to browsing" onPress={() => router.replace('/')} />
          <SecondaryButton label="Search items" onPress={() => router.replace('/search')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: ScreenPadding,
  },
  center: {
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
