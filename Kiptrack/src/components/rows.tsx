import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** iOS-style grouped card: rounded surface with hairline-separated rows. */
export function SettingsGroup({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {children}
    </View>
  );
}

type RowProps = {
  label: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  destructive?: boolean;
  last?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
};

export function SettingsRow({
  label,
  value,
  icon,
  onPress,
  destructive,
  last,
  busy,
  accessibilityHint,
}: RowProps) {
  const theme = useTheme();
  const interactive = Boolean(onPress);

  const content = (pressed: boolean) => (
    <View
      style={[
        styles.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.surfaceRaised },
      ]}>
      {icon ? (
        <Icon
          name={icon}
          size={20}
          color={destructive ? theme.danger : theme.textSecondary}
        />
      ) : null}
      <ThemedText
        variant="callout"
        tone={destructive ? 'danger' : 'text'}
        style={styles.rowLabel}
        numberOfLines={1}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText variant="footnote" tone="textSecondary" numberOfLines={1} style={styles.rowValue}>
          {value}
        </ThemedText>
      ) : null}
      {interactive && !destructive ? (
        <Icon name="chevron" size={14} color={theme.textTertiary} />
      ) : null}
    </View>
  );

  if (!interactive) return <View pointerEvents="none">{content(false)}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(busy), busy: Boolean(busy) }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressedRow : undefined)}>
      {content(false)}
    </Pressable>
  );
}

type SegmentOption<T extends string> = { value: T; label: string; icon?: IconName };

type SegmentedProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Segmented control that maps to the platform look: filled pill on both. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmentTrack, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && {
                backgroundColor: theme.surfaceRaised,
                borderColor: theme.border,
              },
              !selected && { borderColor: 'transparent' },
              pressed && !selected && { opacity: 0.7 },
            ]}>
            {option.icon ? (
              <Icon
                name={option.icon}
                size={16}
                color={selected ? theme.accentStrong : theme.textSecondary}
              />
            ) : null}
            <ThemedText
              variant="footnote"
              tone={selected ? 'text' : 'textSecondary'}
              style={selected ? styles.segmentLabelSelected : undefined}
              numberOfLines={1}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Platform.select({ ios: 13, default: 15 }),
    minHeight: Platform.select({ ios: 44, default: 48 }),
  },
  rowLabel: {
    flex: 1,
  },
  rowValue: {
    maxWidth: '45%',
  },
  pressedRow: {
    opacity: 0.9,
  },
  segmentTrack: {
    flexDirection: 'row',
    gap: Spacing.half,
    padding: Spacing.half,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small + 2,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  segmentLabelSelected: {
    fontWeight: '600',
  },
});
