import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, ScreenPadding, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/** Selectable filter pill. Visual height is 38pt; hit area is padded to 44+. */
export function Chip({ label, selected, onPress }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <ThemedText variant="footnote" tone={selected ? 'onPrimary' : 'textSecondary'} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type ChipRowProps = {
  items: { id: string; label: string }[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Leading "All" option. */
  allLabel: string;
};

export function ChipRow({ items, selectedId, onSelect, allLabel }: ChipRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled">
      <Chip label={allLabel} selected={selectedId === null} onPress={() => onSelect(null)} />
      {items.map((item) => (
        <Chip
          key={item.id}
          label={item.label}
          selected={selectedId === item.id}
          onPress={() => onSelect(item.id)}
        />
      ))}
    </ScrollView>
  );
}

/** Small status pill used for stock and shipping facts. */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'accent' }) {
  const theme = useTheme();
  const isAccent = tone === 'accent';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: isAccent ? theme.accent : theme.surface,
          borderColor: 'transparent',
        },
      ]}>
      <ThemedText variant="caption" tone={isAccent ? 'onAccent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
    paddingHorizontal: ScreenPadding,
    paddingVertical: Spacing.one,
  },
  chip: {
    minHeight: 38,
    minWidth: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.small,
  },
});
