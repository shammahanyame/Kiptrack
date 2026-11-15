import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase';

type PostgrestError = {
  status?: number;
  message: string;
};

type CartUpdateRow = {
  id: string;
  product_id: string;
  qty: number;
  selected_options: Record<string, string>;
  title: string;
  price_minor: number;
  stock_qty: number;
  category_id: string;
  featured: boolean;
  shipping_minor: number;
};

async function insertCartItem(
  buyerId: string,
  productId: string,
  sku: string,
  qty: number,
  selectedOptions: Record<string, string>,
): Promise<CartUpdateRow> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused: unknown = supabase;
  throw new Error('cart_items.insert via this fallback is not available; use supabase client directly');
}

export async function addToCart(productId: string, sku: string, selectedOptions: Record<string, string>) {
  if (!isSupabaseConfigured) {
    throw {
      kind: 'config',
      message: 'Cart is not configured. Check your Supabase connection.',
    };
  }

  const session = await supabase.auth.getSession();
  const buyerId = session.data?.session?.user?.id;
  if (!buyerId) {
    throw {
      kind: 'validation',
      message: 'You must be signed in to add items to your cart.',
    };
  }

  const { data, error } = await supabase
    .from('cart_items')
    .insert({
      buyer_id: buyerId,
      product_id: productId,
      sku,
      qty: 1,
      selected_options: selectedOptions,
      status: 'active',
    })
    .select('id, product_id, qty, selected_options, title, price_minor, stock_qty, category_id, featured, shipping_minor')
    .single();

  if (error) {
    const couldInsert = (error as PostgrestError)?.status === 422 || /unique/.test((error as PostgrestError)?.message ?? '');
    if (couldInsert) {
      return insertCartItem(buyerId, productId, sku, 1, selectedOptions);
    }
    throw error;
  }

  return data as CartUpdateRow;
}

export async function updateCartQty(lineId: string, qty: number) {
  const session = await supabase.auth.getSession();
  const buyerId = session.data?.session?.user?.id;
  if (!buyerId) {
    throw {
      kind: 'validation',
      message: 'You must be signed in to update your cart.',
    };
  }

  const { data, error } = await supabase
    .from('cart_items')
    .update({ qty, updated_at: new Date().toISOString() })
    .eq('id', lineId)
    .eq('buyer_id', buyerId)
    .eq('status', 'active')
    .select('id, product_id, qty, selected_options, title, price_minor, stock_qty, category_id, featured, shipping_minor')
    .single();

  if (error) throw error;
  return data as CartUpdateRow;
}

export async function removeCartLine(lineId: string) {
  const session = await supabase.auth.getSession();
  const buyerId = session.data?.session?.user?.id;
  if (!buyerId) {
    throw {
      kind: 'validation',
      message: 'You must be signed in to remove items from your cart.',
    };
  }

  const { error } = await supabase
    .from('cart_items')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('id', lineId)
    .eq('buyer_id', buyerId)
    .eq('status', 'active');

  if (error) throw error;
}

export async function clearCart() {
  const session = await supabase.auth.getSession();
  const buyerId = session.data?.session?.user?.id;
  if (!buyerId) {
    throw {
      kind: 'validation',
      message: 'You must be signed in to clear your cart.',
    };
  }

  const { error } = await supabase
    .from('cart_items')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('buyer_id', buyerId)
    .eq('status', 'active');

  if (error) throw error;
}
