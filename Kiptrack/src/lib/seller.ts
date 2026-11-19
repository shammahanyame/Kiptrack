import { supabase } from '@/lib/supabase';

export type ListingStatus = 'active' | 'inactive';

export type SellerListing = {
  id: string;
  title: string;
  description: string;
  priceMinor: number;
  stockQty: number;
  images: string[];
  status: ListingStatus;
  categoryId: string;
  categoryName: string;
  createdAt: string;
  publishedAt: string | null;
};

const LISTING_COLUMNS = [
  'id',
  'title',
  'description',
  'selling_price_minor',
  'stock_qty',
  'images',
  'status',
  'category_id',
  'created_at',
  'published_at',
  'categories(name)',
].join(',');

type ListingRow = {
  id: string;
  title: string;
  description: string | null;
  selling_price_minor: number;
  stock_qty: number;
  images: string[] | null;
  status: string;
  category_id: string;
  created_at: string;
  published_at: string | null;
  categories: { name: string } | { name: string }[] | null;
};

function categoryName(row: ListingRow): string {
  const relation = row.categories;
  if (!relation) return 'Uncategorised';
  return (Array.isArray(relation) ? relation[0]?.name : relation.name) ?? 'Uncategorised';
}

function mapListing(row: ListingRow): SellerListing {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    priceMinor: row.selling_price_minor,
    stockQty: row.stock_qty,
    images: (row.images ?? []).filter(Boolean),
    status: row.status === 'active' ? 'active' : 'inactive',
    categoryId: row.category_id,
    categoryName: categoryName(row),
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

/** Every listing owned by the signed-in seller, newest first. */
export async function fetchMyListings(): Promise<SellerListing[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const sellerId = userData.user?.id;
  if (!sellerId) throw new Error('Sign in to manage your listings.');

  const { data, error } = await supabase
    .from('products')
    .select(LISTING_COLUMNS)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return ((data ?? []) as unknown as ListingRow[]).map(mapListing);
}

/** One listing, used to prefill the edit form. */
export async function fetchListing(id: string): Promise<SellerListing | null> {
  const { data, error } = await supabase
    .from('products')
    .select(LISTING_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapListing(data as unknown as ListingRow) : null;
}

/** Show or hide a listing from buyers. */
export async function setListingStatus(id: string, status: ListingStatus): Promise<void> {
  const { error } = await supabase.from('products').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}
