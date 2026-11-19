import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAuth } from '@/state/auth';

export type NavCategoryRef = { id: string; name: string; slug: string; parentId: string | null };

type Activity = { views: Record<string, number>; purchases: Record<string, number> };

type StoredState = {
  /** Pinned categories, in the order they were pinned. */
  pins: string[];
  /** Categories hidden from the bar. */
  hidden: string[];
  /** User-arranged category order; unknown ids are ignored by the bar. */
  order: string[];
  recent: NavCategoryRef[];
  activity: Activity;
};

const CACHE_KEY = 'kiptrack.nav.categories.v1';
const STORAGE_PREFIX = 'kiptrack.nav.v2';
const MAX_RECENT = 8;

/** Per-account so two people sharing a device keep their own bar. */
const storageKey = (userId: string) => `${STORAGE_PREFIX}:${userId}`;

const emptyState = (): StoredState => ({
  pins: [],
  hidden: [],
  order: [],
  recent: [],
  activity: { views: {}, purchases: {} },
});

function parseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parseRefs(value: unknown): NavCategoryRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const ref = item as Partial<NavCategoryRef>;
    if (typeof ref.id !== 'string' || !ref.id) return [];
    return [
      {
        id: ref.id,
        name: typeof ref.name === 'string' ? ref.name : '',
        slug: typeof ref.slug === 'string' ? ref.slug : '',
        parentId:
          ref.parentId === null || typeof ref.parentId === 'string' ? ref.parentId : null,
      },
    ];
  });
}

function parseCounts(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) return {};
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
  );
  return Object.fromEntries(entries);
}

function parseState(value: unknown): StoredState {
  if (typeof value !== 'object' || value === null) return emptyState();
  const stored = value as Partial<StoredState>;
  const activity = (stored.activity ?? {}) as Partial<Activity>;
  return {
    pins: parseIds(stored.pins),
    hidden: parseIds(stored.hidden),
    order: parseIds(stored.order),
    recent: parseRefs(stored.recent).slice(0, MAX_RECENT),
    activity: { views: parseCounts(activity.views), purchases: parseCounts(activity.purchases) },
  };
}

type NavValue = StoredState & {
  ready: boolean;
  /** Last categories seen online, used when the catalogue cannot load. */
  cached: NavCategoryRef[];
  togglePin: (id: string) => void;
  toggleHidden: (id: string) => void;
  moveCategory: (id: string, direction: -1 | 1, orderedIds: string[]) => void;
  recordView: (category: NavCategoryRef) => void;
  recordPurchase: (categoryIds: string[]) => void;
  saveCached: (categories: NavCategoryRef[]) => void;
};

const NavContext = createContext<NavValue>({
  ...emptyState(),
  ready: false,
  cached: [],
  togglePin: () => {},
  toggleHidden: () => {},
  moveCategory: () => {},
  recordView: () => {},
  recordPurchase: () => {},
  saveCached: () => {},
});

export function NavProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const userId = user?.id ?? 'guest';
  const [state, setState] = useState<StoredState>(emptyState);
  const [cached, setCached] = useState<NavCategoryRef[]>([]);
  const [ready, setReady] = useState(false);
  const cachedFingerprint = useRef('');

  useEffect(() => {
    let active = true;
    setReady(false);
    setState(emptyState());

    AsyncStorage.multiGet([storageKey(userId), CACHE_KEY])
      .then((pairs) => {
        if (!active) return;
        const raw = pairs[0]?.[1] ?? null;
        const rawCache = pairs[1]?.[1] ?? null;

        if (raw) {
          try {
            setState(parseState(JSON.parse(raw)));
          } catch {
            // A corrupt preference falls back to the default bar.
          }
        }

        if (rawCache) {
          try {
            const parsed = parseRefs(JSON.parse(rawCache)).slice(0, 60);
            cachedFingerprint.current = JSON.stringify(parsed);
            setCached(parsed);
          } catch {
            // Same for the offline copy.
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const update = useCallback(
    (updater: (current: StoredState) => StoredState) => {
      setState((current) => {
        const next = updater(current);
        AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [userId],
  );

  const togglePin = useCallback(
    (id: string) => {
      update((current) => ({
        ...current,
        pins: current.pins.includes(id)
          ? current.pins.filter((value) => value !== id)
          : [...current.pins, id],
        hidden: current.hidden.filter((value) => value !== id),
      }));
    },
    [update],
  );

  const toggleHidden = useCallback(
    (id: string) => {
      update((current) => {
        const hidden = current.hidden.includes(id);
        return {
          ...current,
          hidden: hidden ? current.hidden.filter((value) => value !== id) : [...current.hidden, id],
          pins: hidden ? current.pins : current.pins.filter((value) => value !== id),
        };
      });
    },
    [update],
  );

  const moveCategory = useCallback(
    (id: string, direction: -1 | 1, orderedIds: string[]) => {
      const index = orderedIds.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= orderedIds.length) return;

      const next = [...orderedIds];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      update((current) => ({ ...current, order: next }));
    },
    [update],
  );

  const recordView = useCallback(
    (category: NavCategoryRef) => {
      if (!category.id) return;
      update((current) => ({
        ...current,
        recent: [category, ...current.recent.filter((entry) => entry.id !== category.id)].slice(
          0,
          MAX_RECENT,
        ),
        activity: {
          ...current.activity,
          views: {
            ...current.activity.views,
            [category.id]: (current.activity.views[category.id] ?? 0) + 1,
          },
        },
      }));
    },
    [update],
  );

  const recordPurchase = useCallback(
    (categoryIds: string[]) => {
      const unique = [...new Set(categoryIds)].filter(Boolean);
      if (unique.length === 0) return;
      update((current) => {
        const purchases = { ...current.activity.purchases };
        for (const id of unique) purchases[id] = (purchases[id] ?? 0) + 1;
        return { ...current, activity: { ...current.activity, purchases } };
      });
    },
    [update],
  );

  const saveCached = useCallback((categories: NavCategoryRef[]) => {
    if (categories.length === 0) return;
    const trimmed = categories.slice(0, 60);
    const fingerprint = JSON.stringify(trimmed);
    if (fingerprint === cachedFingerprint.current) return;
    cachedFingerprint.current = fingerprint;
    setCached(trimmed);
    AsyncStorage.setItem(CACHE_KEY, fingerprint).catch(() => {});
  }, []);

  const value = useMemo<NavValue>(
    () => ({
      ...state,
      ready,
      cached,
      togglePin,
      toggleHidden,
      moveCategory,
      recordView,
      recordPurchase,
      saveCached,
    }),
    [
      state,
      ready,
      cached,
      togglePin,
      toggleHidden,
      moveCategory,
      recordView,
      recordPurchase,
      saveCached,
    ],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  return useContext(NavContext);
}
