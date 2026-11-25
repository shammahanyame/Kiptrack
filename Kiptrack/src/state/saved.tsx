import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/state/auth';
import { addToWishlist, fetchWishlistIds, removeFromWishlist } from '@/lib/wishlist';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'kiptrack.saved.v1';

type SavedValue = {
  ids: string[];
  isSaved: (id: string) => boolean;
  toggle: (id: string) => void;
  clear: () => void;
  ready: boolean;
};

const SavedContext = createContext<SavedValue>({
  ids: [],
  isSaved: () => false,
  toggle: () => {},
  clear: () => {},
  ready: false,
});

export function SavedProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  // Initial load: prefer server wishlist when signed in, else local cache.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (user) {
        try {
          const serverIds = await fetchWishlistIds();
          if (cancelled) return;
          setIds(serverIds);
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(serverIds)).catch(() => {});
          if (!cancelled) setReady(true);
          return;
        } catch {
          // fall through to local
        }
      }
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            setIds(parsed.filter((value): value is string => typeof value === 'string'));
          }
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const toggle = useCallback(
    (id: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setIds((current) => {
        const isCurrentlySaved = current.includes(id);
        const next = isCurrentlySaved
          ? current.filter((value) => value !== id)
          : [id, ...current];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});

        // Sync to Supabase in the background when signed in.
        if (user) {
          if (isCurrentlySaved) {
            removeFromWishlist(id).catch(() => {});
          } else {
            // Fetch the product price to record the watched price.
            (async () => {
              try {
                const { data } = await supabase
                  .from('products')
                  .select('selling_price_minor')
                  .eq('id', id)
                  .maybeSingle();
                const price =
                  typeof data?.selling_price_minor === 'number' ? data.selling_price_minor : 0;
                await addToWishlist(id, price);
              } catch {
                // best effort
              }
            })();
          }
        }

        return next;
      });
    },
    [user],
  );

  const clear = useCallback(() => {
    setIds([]);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([])).catch(() => {});
    // Server-side clear is not bulk-supported here; leave remote as-is.
  }, []);

  const value = useMemo<SavedValue>(
    () => ({
      ids,
      isSaved: (id: string) => ids.includes(id),
      toggle,
      clear,
      ready,
    }),
    [ids, toggle, clear, ready],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  return useContext(SavedContext);
}
