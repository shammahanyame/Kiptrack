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
import { useTheme } from '@/hooks/use-theme';
import { resetPassword, signIn } from '@/lib/auth';
import { destinationAfterAuth } from '@/lib/auth-redirect';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/state/auth';

/**
 * Sign-in screen. Email and password, with a password reset link and a way over
 * to the sign-up screen. Buyers and sellers use the same account.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { next, notice: noticeParam } = useLocalSearchParams<{ next?: string; notice?: string }>();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(
    noticeParam === 'confirm' ? 'Check your inbox to confirm your account, then sign in.' : '',
  );

  const destination = destinationAfterAuth(next);
  const canSubmit = email.trim().length > 0 && password.length >= 6;

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
    if (!canSubmit) {
      setError('Enter your email and password to continue.');
      return;
    }

    setBusy(true);
    try {
      await signIn(email, password);
      router.replace(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign you in.');
    } finally {
      setBusy(false);
    }
  };

  const forgotPassword = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter the email you signed up with first.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email);
      setNotice(`A reset link is on its way to ${email.trim()}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset link.');
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
          <ThemedText variant="title">Welcome back</ThemedText>
          <ThemedText variant="body" tone="textSecondary" style={styles.headerText}>
            Sign in to shop, track orders and manage what you sell.
          </ThemedText>
        </View>

        <View style={styles.form}>
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
            placeholder="Your password"
            autoCapitalize="none"
            autoComplete="current-password"
            secureTextEntry
            textContentType="password"
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
            label="Sign in"
            onPress={submit}
            busy={busy}
            disabled={!isSupabaseConfigured}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send a password reset link"
            onPress={forgotPassword}
            style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}>
            <ThemedText variant="footnote" tone="accentText">
              Forgot your password?
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <ThemedText variant="footnote" tone="textSecondary">
            New to Kiptrack?{' '}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace({ pathname: '/signup', params: next ? { next } : {} })}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedText variant="footnote" tone="accentText" style={styles.strong}>
              Create an account
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
  forgot: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
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
