import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'kiptrack.cart.v1';

export type CartLine = {
  product: string;
  sku: string;
  qty: number;
  selectedOptions: Record<string, string>;
};

export type CartState = {
  lines: CartLine[];
  isEmpty: boolean;
  add: (line: CartLine) => void;
  updateQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  ready: boolean;
};

const CartContext = createContext<CartState>({
  lines: [],
  isEmpty: true,
  add: () => {},
  updateQty: () => {},
  remove: () => {},
  clear: () => {},
  ready: false,
});

export function CartProvider({ children }: PropsWithChildren) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setLines(
            parsed.filter(
              (value): value is CartLine =>
                typeof value === 'object' &&
                value !== null &&
                'product' in value &&
                typeof (value as CartLine).product === 'string' &&
                'sku' in value &&
                typeof (value as CartLine).sku === 'string' &&
                'qty' in value &&
                typeof (value as CartLine).qty === 'number' &&
                'selectedOptions' in value &&
                typeof (value as CartLine).selectedOptions === 'object'
            ),
          );
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

  const persist = useCallback(
    (next: CartLine[]) => {
      setLines(next);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    },
    [],
  );

  const add = useCallback(
    (line: CartLine) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setLines((current) => {
        const existing = current.find((item) => item.product === line.product && item.sku === line.sku);
        if (existing) {
          return current.map((item) =>
            item.product === line.product && item.sku === line.sku
              ? { ...item, qty: item.qty + 1 }
              : item,
          );
        }
        persist([...current, { ...line, qty: 1 }]);
        return [...current, { ...line, qty: 1 }];
      });
    },
    [persist],
  );

  const updateQty = useCallback(
    (id: string, qty: number) => {
      if (qty <= 0) {
        remove(id);
        return;
      }
      setLines((current) =>
        current.map((item) => (item.product === id ? { ...item, qty } : item)),
      );
      persist(
        lines.map((item) => (item.product === id ? { ...item, qty } : item)),
      );
    },
    [lines, persist],
  );

  const remove = useCallback(
    (id: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setLines((current) => current.filter((item) => item.product !== id));
      persist(lines.filter((item) => item.product !== id));
    },
    [lines, persist],
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  const value = useMemo<CartState>(
    () => ({
      lines,
      isEmpty: lines.length === 0,
      add,
      updateQty,
      remove,
      clear,
      ready,
    }),
    [lines, add, updateQty, remove, clear, ready],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
