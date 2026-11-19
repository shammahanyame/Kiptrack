import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchListing, fetchMyListings, type SellerListing } from '@/lib/seller';

type Status = 'loading' | 'ready' | 'error';

export function useSellerListings() {
  const [status, setStatus] = useState<Status>('loading');
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    fetchMyListings()
      .then((next) => {
        if (!active) return;
        setListings(next);
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
  }, [attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return useMemo(() => ({ status, listings, error, reload }), [status, listings, error, reload]);
}

export function useListing(id: string | undefined) {
  const [status, setStatus] = useState<Status>(id ? 'loading' : 'ready');
  const [listing, setListing] = useState<SellerListing | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) {
      setStatus('ready');
      setListing(null);
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    fetchListing(id)
      .then((result) => {
        if (!active) return;
        setListing(result);
        setStatus(result ? 'ready' : 'error');
        if (!result) setError(new Error('Listing not found'));
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught);
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [id, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return { status, listing, error, reload };
}
