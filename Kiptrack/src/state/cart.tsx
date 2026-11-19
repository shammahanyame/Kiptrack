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

const STORAGE_KEY = 'kiptrack.cart.v2';

export type CartLine = {
  /** Product id. */
  product: string;
  /** Stock-keeping unit for the chosen options. */
  sku: string;
  title: string;
  priceMinor: number;
  image?: string;
  qty: number;
  selectedOptions: Record<string, string>;
};

/** What `add` accepts: quantity defaults to 1. */
export type CartInput = Omit<CartLine, 'qty'> & { qty?: number };

export type CartState = {
  lines: CartLine[];
  /** Total number of units in the cart. */
  count: number;
  /** Sum of `qty * priceMinor`, in minor units (XAF). */
  subtotalMinor: number;
  isEmpty: boolean;
  add: (line: CartInput) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  ready: boolean;
};

/** Stable identity for a line: the same product in another option is a separate line. */
export function cartLineKey(line: Pick<CartLine, 'product' | 'sku'>): string {
  return `${line.product}::${line.sku}`;
}

const CartContext = createContext<CartState>({
  lines: [],
  count: 0,
  subtotalMinor: 0,
  isEmpty: true,
  add: () => {},
  setQty: () => {},
  remove: () => {},
  clear: () => {},
  ready: false,
});

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false;
  const line = value as CartLine;
  return (
    typeof line.product === 'string' &&
    typeof line.sku === 'string' &&
    typeof line.title === 'string' &&
    typeof line.priceMinor === 'number' &&
    typeof line.qty === 'number' &&
    typeof line.selectedOptions === 'object' &&
    line.selectedOptions !== null
  );
}

export function CartProvider({ children }: PropsWithChildren) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setLines(parsed.filter(isCartLine));
      })
      .catch(() => {
        // A corrupt cart should never block the app; start clean instead.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const mutate = useCallback((updater: (current: CartLine[]) => CartLine[]) => {
    setLines((current) => {
      const next = updater(current);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const add = useCallback(
    (line: CartInput) => {
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      const qty = Math.max(1, Math.round(line.qty ?? 1));
      mutate((current) => {
        const key = cartLineKey(line);
        if (current.some((item) => cartLineKey(item) === key)) {
          return current.map((item) =>
            cartLineKey(item) === key ? { ...item, qty: item.qty + qty } : item,
          );
        }
        return [...current, { ...line, qty }];
      });
    },
    [mutate],
  );

  const setQty = useCallback(
    (key: string, qty: number) => {
      mutate((current) =>
        qty <= 0
          ? current.filter((item) => cartLineKey(item) !== key)
          : current.map((item) => (cartLineKey(item) === key ? { ...item, qty } : item)),
      );
    },
    [mutate],
  );

  const remove = useCallback(
    (key: string) => {
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      mutate((current) => current.filter((item) => cartLineKey(item) !== key));
    },
    [mutate],
  );

  const clear = useCallback(() => {
    mutate(() => []);
  }, [mutate]);

  const value = useMemo<CartState>(() => {
    const count = lines.reduce((sum, line) => sum + line.qty, 0);
    const subtotalMinor = lines.reduce((sum, line) => sum + line.qty * line.priceMinor, 0);
    return {
      lines,
      count,
      subtotalMinor,
      isEmpty: lines.length === 0,
      add,
      setQty,
      remove,
      clear,
      ready,
    };
  }, [lines, add, setQty, remove, clear, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
