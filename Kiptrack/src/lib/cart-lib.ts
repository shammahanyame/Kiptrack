import { useCallback, useContext } from 'react';

import { useCart } from '@/state/cart';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase';

export type CartLine = {
  product: string;
  sku: string;
  qty: number;
  selectedOptions: Record<string, string>;
};

export type CartItem = {
  id: string;
  product: string;
  sku: string;
  qty: number;
  selectedOptions: Record<string, string>;
  title: string;
  priceMinor: number;
  stockQty: number;
  images: string[];
  categoryId: string;
  featured: boolean;
  shippingMinor: number;
};

export type CartError =
  | { kind: 'config'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'validation'; message: string }
  | { kind: 'unknown'; message: string };

function toCartError(error: unknown): CartError {
  const message =
    error instanceof Error ? error.message : String(error);
  if (/network request failed|failed to fetch|timeout|ENOTFOUND/i.test(message)) {
    return { kind: 'network', message };
  }
  if (/validation|check constraint|violates check/.test(message)) {
    return { kind: 'validation', message };
  }
  return { kind: 'unknown', message };
}

export function useCartSync() {
  const { lines, isEmpty, add, remove, updateQty, clear, ready } = useCart();

  const items = useCallback(
    async (): Promise<CartItem[]> => {
      if (!isSupabaseConfigured) {
        return [];
      }
      const result = await supabase
        .from('cart_items')
        .select(
          `id, product, sku, qty, selected_options, title, price_minor, stock_qty, images, category_id, featured, shipping_minor`,
        )
        .eq('buyer_id', (await supabase.auth.getSession()).data?.session?.user.id)
        .eq('status', 'active');
      if (result.error) throw result.error;
      return (result.data ?? []) as unknown as CartItem[];
    },
    [],
  );

  return {
    lines,
    isEmpty,
    items,
    add,
    updateQty,
    remove,
    clear,
    ready,
  };
}
