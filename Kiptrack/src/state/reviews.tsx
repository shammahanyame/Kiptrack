import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';
import { Platform } from 'react-native';

const STORAGE_KEY = 'kiptrack.reviews.v1';

export type Review = {
  id: string;
  product: string;
  seller: string;
  buyer: string;
  rating: number;
  title: string;
  body: string;
  isVerifiedPurchase: boolean;
  status: 'published' | 'hidden' | 'rejected';
  createdAt: string;
};

export type ReviewsState = {
  reviews: Review[];
  isEmpty: boolean;
  loadReviews: (productId: string) => Promise<void>;
  addReview: (productId: string, rating: number, title: string, body: string) => Promise<void>;
  clear: () => void;
  ready: boolean;
};

const ReviewsContext = createContext<ReviewsState>({
  reviews: [],
  isEmpty: true,
  loadReviews: async () => {},
  addReview: async () => {},
  clear: () => {},
  ready: false,
});

export function ReviewsProvider({ children }: PropsWithChildren) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setReviews(
            parsed.filter(
              (value): value is Review =>
                typeof value === 'object' &&
                value !== null &&
                'id' in value &&
                typeof (value as Review).id === 'string' &&
                'product' in value &&
                typeof (value as Review).product === 'string' &&
                'rating' in value &&
                typeof (value as Review).rating === 'number' &&
                'createdAt' in value &&
                typeof (value as Review).createdAt === 'string',
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
    (next: Review[]) => {
      setReviews(next);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    },
    [],
  );

  const loadReviews = useCallback(
    async (productId: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      const session = await supabase.auth.getSession();
      const buyerId = session.data?.session?.user?.id;
      if (!buyerId) return;

      const { data, error } = await supabase
        .from('reviews')
        .select('*')
        .eq('product_id', productId)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) return;

      persist(
        (data ?? []) as Review[],
      );
    },
    [persist],
  );

  const addReview = useCallback(
    async (productId: string, rating: number, title: string, body: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      const session = await supabase.auth.getSession();
      const buyerId = session.data?.session?.user?.id;
      if (!buyerId) {
        throw new Error('You must be signed in to leave a review.');
      }

      const { data, error } = await supabase
        .from('reviews')
        .insert({
          product_id: productId,
          seller_id: buyerId,
          buyer_id: buyerId,
          rating,
          title,
          body,
          is_verified_purchase: true,
          status: 'published',
        })
        .select()
        .single();

      if (error) throw error;

      persist([data as Review, ...reviews]);
    },
    [reviews],
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  const value = useMemo<ReviewsState>(
    () => ({
      reviews,
      isEmpty: reviews.length === 0,
      loadReviews,
      addReview,
      clear,
      ready,
    }),
    [reviews, loadReviews, addReview, clear, ready],
  );

  return <ReviewsContext.Provider value={value}>{children}</ReviewsContext.Provider>;
}

export function useReviews() {
  return useContext(ReviewsContext);
}
