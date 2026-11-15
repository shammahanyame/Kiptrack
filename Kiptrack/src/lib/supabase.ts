import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The app browses the public catalogue with the anon key. RLS on the backend
 * only exposes active products and categories to anonymous readers, and never
 * exposes cost data (see `supabase/README.md`).
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  // Falls back to an unreachable placeholder so the module never throws at
  // import time; callers check `isSupabaseConfigured` and surface a readable
  // error instead of a blank screen.
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
