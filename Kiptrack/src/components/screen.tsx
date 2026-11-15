import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Full-bleed screen background that respects the current theme. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[{ flex: 1, backgroundColor: theme.background }, style]}>{children}</View>;
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: ReactNode;
  right?: ReactNode;
};

/**
 * Fixed screen header. Sits below the status bar/Dynamic Island using the real
 * safe-area inset, and keeps a 44pt row so the title never crowds the top edge.
 */
export function ScreenHeader({ title, subtitle, eyebrow, right }: HeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          {eyebrow ? <View style={styles.eyebrow}>{eyebrow}</View> : null}
          <ThemedText variant="display" accessibilityRole="header">
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="footnote" tone="textSecondary">
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  );
}

export function SectionHeader({
  title,
  action,
  style,
}: {
  title: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <ThemedText variant="headline" accessibilityRole="header">
        {title}
      </ThemedText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: ScreenPadding,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.three,
    minHeight: 44,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    marginBottom: Spacing.one,
  },
  headerRight: {
    paddingBottom: Spacing.one,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: ScreenPadding,
  },
});
