import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

const STORAGE_KEY = 'kiptrack.recent.v1';
const MAX_ITEMS = 12;

type RecentValue = {
  ids: string[];
  record: (id: string) => void;
  clear: () => void;
  ready: boolean;
};

const RecentContext = createContext<RecentValue>({
  ids: [],
  record: () => {},
  clear: () => {},
  ready: false,
});

/**
 * Recently viewed products, most recent first, stored on this device. Mirrors
 * the "recently viewed" rail shoppers expect from a storefront.
 */
export function RecentProvider({ children }: PropsWithChildren) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setIds(parsed.filter((value): value is string => typeof value === 'string').slice(0, MAX_ITEMS));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const record = useCallback((id: string) => {
    setIds((current) => {
      if (current[0] === id) return current;
      const next = [id, ...current.filter((value) => value !== id)].slice(0, MAX_ITEMS);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const value = useMemo<RecentValue>(() => ({ ids, record, clear, ready }), [ids, record, clear, ready]);

  return <RecentContext.Provider value={value}>{children}</RecentContext.Provider>;
}

export function useRecent() {
  return useContext(RecentContext);
}
