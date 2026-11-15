import { StyleSheet, TextInput, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  rating: number;
  setRating: (rating: number) => void;
  title: string;
  setTitle: (title: string) => void;
  body: string;
  setBody: (body: string) => void;
  onSubmit: () => void;
  busy: boolean;
};

export function ReviewForm({
  rating,
  setRating,
  title,
  setTitle,
  body,
  setBody,
  onSubmit,
  busy,
}: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      <ThemedText variant="bodyStrong" tone="text" style={styles.sectionTitle}>
        Write a review
      </ThemedText>

      <View style={styles.ratingRow}>
        <ThemedText variant="footnote" tone="textSecondary">
          Rating
        </ThemedText>
        <View style={styles.stars}>
          {Array.from({ length: 5 }, (_, i) => i < rating).map((filled, i) => (
            <ThemedText key={i} onPress={() => setRating(i + 1)}>
              ★
            </ThemedText>
          ))}
        </View>
      </View>

      <TextInput
        placeholder="Title"
        placeholderTextColor={theme.textTertiary}
        value={title}
        onChangeText={setTitle}
        style={styles.input}
        multiline
        numberOfLines={2}
      />

      <TextInput
        placeholder="Your review"
        placeholderTextColor={theme.textTertiary}
        value={body}
        onChangeText={setBody}
        style={[styles.input, { height: 80 }]}
        multiline
        numberOfLines={4}
      />

      <PrimaryButton
        label="Submit review"
        onPress={onSubmit}
        disabled={!title || !body}
        busy={busy}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E6E1',
    overflow: 'hidden',
  },
  sectionTitle: {
    padding: Spacing.three,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  input: {
    height: 80,
    textAlignVertical: 'top',
    padding: Spacing.three,
    fontSize: 16,
  },
  button: {
    margin: Spacing.three,
  },
});
