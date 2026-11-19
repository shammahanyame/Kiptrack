import { supabase } from '@/lib/supabase';

export type Review = {
  id: string;
  productId: string;
  buyerId: string;
  buyerName: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
};

export type RatingSummary = {
  count: number;
  average: number;
  distribution: { stars: number; count: number }[];
};

type ReviewRow = {
  id: string;
  product_id: string;
  buyer_id: string;
  buyer_name: string | null;
  rating: number;
  title: string;
  body: string;
  created_at: string;
};

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id,
    productId: row.product_id,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name?.trim() || 'Kiptrack buyer',
    rating: row.rating,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function summarizeReviews(reviews: Review[]): RatingSummary {
  const count = reviews.length;
  const average = count === 0 ? 0 : reviews.reduce((sum, review) => sum + review.rating, 0) / count;
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((review) => review.rating === stars).length,
  }));

  return { count, average, distribution };
}

/** Newest first. Reviews are public, so this works signed out too. */
export async function fetchProductReviews(productId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id,product_id,buyer_id,buyer_name,rating,title,body,created_at')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ReviewRow[]).map(mapReview);
}

export async function createReview(input: {
  productId: string;
  rating: number;
  title: string;
  body: string;
}): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const buyerId = userData.user?.id;
  if (!buyerId) throw new Error('Sign in to write a review.');

  const name = userData.user?.user_metadata?.name;
  const buyerName = typeof name === 'string' && name.trim() ? name.trim() : 'Kiptrack buyer';

  const { error } = await supabase.from('reviews').insert({
    product_id: input.productId,
    buyer_id: buyerId,
    buyer_name: buyerName,
    rating: input.rating,
    title: input.title.trim(),
    body: input.body.trim(),
  });
  if (error) throw error;
}

/** Turns the unique-per-buyer constraint into something a person can read. */
export function reviewErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/duplicate key|unique constraint/i.test(message)) {
    return 'You have already reviewed this item.';
  }
  if (/row-level security|permission denied|policy/i.test(message)) {
    return 'Reviews are not accepting new entries yet. Try again later.';
  }
  if (/relation .*reviews.* does not exist/i.test(message)) {
    return 'Reviews are not set up on this project yet.';
  }
  return message || 'Could not submit your review.';
}
