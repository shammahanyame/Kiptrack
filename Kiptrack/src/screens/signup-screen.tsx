import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark, Wordmark } from '@/components/brand';
import { PrimaryButton } from '@/components/button';
import { FormField } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ScreenPadding, Spacing } from '@/constants/theme';
import { signUp } from '@/lib/auth';
import { destinationAfterAuth } from '@/lib/auth-redirect';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/auth';

/**
 * Sign-up screen. Name, email and password; Supabase may require the address to
 * be confirmed before a session exists, in which case the user is sent to the
 * sign-in screen with a notice.
 */
export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { user, loading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const destination = destinationAfterAuth(next);

  useEffect(() => {
    if (!loading && user) router.replace(destination);
  }, [loading, user, destination]);

  const submit = async () => {
    setError('');
    setNotice('');
    if (!isSupabaseConfigured) {
      setError('Add your Supabase URL and anon key to the .env file first.');
      return;
    }
    if (!name.trim()) return setError('Tell buyers what to call you.');
    if (!email.trim()) return setError('Enter your email address.');
    if (password.length < 8) return setError('Choose a password with at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    try {
      const { needsConfirmation } = await signUp(email, password, name);
      if (needsConfirmation) {
        router.replace({
          pathname: '/login',
          params: { ...(next ? { next } : {}), notice: 'confirm' },
        });
      } else {
        router.replace(destination);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <BrandMark size={54} />
          <Wordmark size={24} />
        </View>

        <View style={styles.header}>
          <ThemedText variant="title">Create your account</ThemedText>
          <ThemedText variant="body" tone="textSecondary" style={styles.headerText}>
            One account to shop and to sell on Kiptrack.
          </ThemedText>
        </View>

        <View style={styles.form}>
          <FormField
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ada Nkemelu"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
          <FormField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <FormField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
            textContentType="newPassword"
            hint="At least 8 characters."
            returnKeyType="next"
          />
          <FormField
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat your password"
            autoCapitalize="none"
            autoComplete="new-password"
            secureTextEntry
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submit}
          />

          {error ? (
            <ThemedText variant="footnote" tone="danger" accessibilityRole="alert">
              {error}
            </ThemedText>
          ) : null}
          {notice ? (
            <ThemedText variant="footnote" tone="success" accessibilityRole="alert">
              {notice}
            </ThemedText>
          ) : null}

          <PrimaryButton
            label="Create account"
            onPress={submit}
            busy={busy}
            disabled={!isSupabaseConfigured}
          />

          <ThemedText variant="caption" tone="textTertiary" style={styles.terms}>
            By creating an account you agree to use Kiptrack responsibly and to keep your
            listings accurate.
          </ThemedText>
        </View>

        <View style={styles.footer}>
          <ThemedText variant="footnote" tone="textSecondary">
            Already have an account?{' '}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace({ pathname: '/login', params: next ? { next } : {} })}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText variant="footnote" tone="accentText" style={styles.strong}>
              Sign in
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: ScreenPadding,
    paddingTop: Spacing.six,
    gap: Spacing.four,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  header: { gap: Spacing.one },
  headerText: { maxWidth: 340 },
  form: { gap: Spacing.three },
  terms: { textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  strong: { fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
