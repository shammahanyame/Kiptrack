import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Supabase auth helpers.
 *
 * Every account is a plain email+password Supabase user. The same account can
 * buy and sell: the seller flows just need a signed-in user, and RLS on the
 * backend decides what a row owner may write.
 */

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
}

/**
 * Creates an account. When the project requires email confirmation Supabase
 * returns no session, so the caller has to tell the user to check their inbox.
 */
export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim() } },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

/** Where the reset link lands: a browser route on web, the app scheme on native. */
function resetRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/login`;
  }
  return 'kiptrack://login';
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: resetRedirect(),
  });
  if (error) throw error;
}

export async function updateProfile(name: string) {
  const { error } = await supabase.auth.updateUser({ data: { name: name.trim() } });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
