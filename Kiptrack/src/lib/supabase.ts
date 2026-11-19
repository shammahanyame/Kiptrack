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

// Expo Router can render routes in Node before the browser starts. AsyncStorage's
// web implementation reads from `window`, so use an empty in-memory store during
// that server render and let AsyncStorage persist sessions in the actual app.
const serverStorage = new Map<string, string>();
const authStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return Promise.resolve(serverStorage.get(key) ?? null);
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') {
      serverStorage.set(key, value);
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') {
      serverStorage.delete(key);
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(
  // Falls back to an unreachable placeholder so the module never throws at
  // import time; callers check `isSupabaseConfigured` and surface a readable
  // error instead of a blank screen.
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: authStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
