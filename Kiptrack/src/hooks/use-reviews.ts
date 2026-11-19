import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchProductReviews, summarizeReviews, type Review } from '@/lib/reviews';

type Status = 'idle' | 'loading' | 'ready' | 'error';

export function useProductReviews(productId: string | undefined) {
  const [status, setStatus] = useState<Status>(productId ? 'loading' : 'idle');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!productId) {
      setStatus('idle');
      setReviews([]);
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    fetchProductReviews(productId)
      .then((next) => {
        if (!active) return;
        setReviews(next);
        setStatus('ready');
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught);
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [productId, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return useMemo(
    () => ({ status, reviews, summary: summarizeReviews(reviews), error, reload }),
    [status, reviews, error, reload],
  );
}
