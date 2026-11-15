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

export type SchemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'kiptrack.preferences.v1';

type PreferencesValue = {
  /** What the user picked in Settings. */
  preference: SchemePreference;
  setPreference: (value: SchemePreference) => void;
  /** True once the stored preference has been read. */
  ready: boolean;
};

const PreferencesContext = createContext<PreferencesValue>({
  preference: 'system',
  setPreference: () => {},
  ready: false,
});

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<SchemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as { scheme?: SchemePreference };
        if (parsed.scheme === 'light' || parsed.scheme === 'dark' || parsed.scheme === 'system') {
          setPreferenceState(parsed.scheme);
        }
      })
      .catch(() => {
        // A corrupt or unreadable preference is not worth failing the app over.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((value: SchemePreference) => {
    setPreferenceState(value);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ scheme: value })).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference, ready }),
    [preference, setPreference, ready]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
