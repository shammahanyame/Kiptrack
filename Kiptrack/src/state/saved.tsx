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
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setIds(parsed.filter((value): value is string => typeof value === 'string'));
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

  const persist = useCallback((next: string[]) => {
    setIds(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const toggle = useCallback(
    (id: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setIds((current) => {
        const next = current.includes(id)
          ? current.filter((value) => value !== id)
          : [id, ...current];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  const value = useMemo<SavedValue>(
    () => ({
      ids,
      isSaved: (id: string) => ids.includes(id),
      toggle,
      clear,
      ready,
    }),
    [ids, toggle, clear, ready]
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  return useContext(SavedContext);
}
