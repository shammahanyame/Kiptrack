import { supabase } from '@/lib/supabase';

export async function fetchWishlistIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('wishlist_items')
    .select('product_id')
    .order('added_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as { product_id: string }[]).map((r) => r.product_id);
}

export async function addToWishlist(productId: string, priceMinor: number): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const buyerId = userData.user?.id;
  if (!buyerId) throw new Error('Sign in to save items.');
  const { error } = await supabase.from('wishlist_items').upsert(
    {
      buyer_id: buyerId,
      product_id: productId,
      price_watched_minor: priceMinor,
      alert_enabled: true,
    },
    { onConflict: 'buyer_id,product_id' },
  );
  if (error) throw error;
}

export async function removeFromWishlist(productId: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const buyerId = userData.user?.id;
  if (!buyerId) throw new Error('Sign in to manage saved items.');
  const { error } = await supabase
    .from('wishlist_items')
    .delete()
    .eq('buyer_id', buyerId)
    .eq('product_id', productId);
  if (error) throw error;
}
