import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
};

/**
 * Primary action. 50pt tall on both platforms (iOS HIG wants ≥44, Material
 * ≥48) and uses the ink/clay brand pair so the label clears WCAG AA.
 */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  accessibilityHint,
  style,
  icon,
}: ButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: theme.primary },
        pressed && styles.pressed,
        (disabled || busy) && styles.disabled,
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={theme.onPrimary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <ThemedText variant="bodyStrong" tone="onPrimary">
            {label}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

/** Secondary action: sits on a surface with a hairline border. */
export function SecondaryButton({ label, onPress, disabled, style, icon }: ButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? theme.surface : 'transparent',
          borderColor: theme.border,
          borderWidth: StyleSheet.hairlineWidth * 2,
        },
        disabled && styles.disabled,
        style,
      ]}>
      <View style={styles.content}>
        {icon}
        <ThemedText variant="bodyStrong" tone="text">
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    minWidth: TouchTarget,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.4,
  },
});
