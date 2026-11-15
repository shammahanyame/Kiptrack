import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { PrimaryButton, SecondaryButton } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function LoadingState({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={theme.accentStrong} size="large" />
      <ThemedText variant="footnote" tone="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

type ErrorStateProps = {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
};

export function ErrorState({ title, message, retryLabel, onRetry }: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <View style={[styles.iconCircle, { backgroundColor: theme.surface }]}>
        <Icon name="error" size={24} color={theme.textSecondary} />
      </View>
      <ThemedText variant="headline" style={styles.centerText}>
        {title}
      </ThemedText>
      <ThemedText variant="footnote" tone="textSecondary" style={styles.centerText}>
        {message}
      </ThemedText>
      <PrimaryButton label={retryLabel} onPress={onRetry} style={styles.action} />
    </View>
  );
}

type EmptyStateProps = {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={styles.center}>
      <View style={[styles.iconCircle, { backgroundColor: theme.surface }]}>
        <Icon name={icon} size={24} color={theme.accentStrong} />
      </View>
      <ThemedText variant="headline" style={styles.centerText}>
        {title}
      </ThemedText>
      <ThemedText variant="footnote" tone="textSecondary" style={styles.centerText}>
        {message}
      </ThemedText>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
      {secondaryLabel && onSecondary ? (
        <SecondaryButton label={secondaryLabel} onPress={onSecondary} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: ScreenPadding + Spacing.four,
    paddingVertical: Spacing.six,
    minHeight: 220,
  },
  centerText: {
    textAlign: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: Radius.large,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  action: {
    alignSelf: 'stretch',
    marginTop: Spacing.three,
  },
});
