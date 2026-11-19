import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  fetchBuyerOrder,
  fetchBuyerOrders,
  fetchSellerOrders,
  type Order,
  type SellerOrder,
} from '@/lib/orders';

type Status = 'loading' | 'ready' | 'error';

function useAsyncList<T>(load: () => Promise<T[]>) {
  const [status, setStatus] = useState<Status>('loading');
  const [rows, setRows] = useState<T[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError(null);

    load()
      .then((next) => {
        if (!active) return;
        setRows(next);
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
  }, [load, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return useMemo(() => ({ status, rows, error, reload }), [status, rows, error, reload]);
}

export function useBuyerOrders() {
  const { status, rows, error, reload } = useAsyncList<Order>(
    useCallback(() => fetchBuyerOrders(), []),
  );
  return { status, orders: rows, error, reload };
}

export function useSellerOrders() {
  const { status, rows, error, reload } = useAsyncList<SellerOrder>(
    useCallback(() => fetchSellerOrders(), []),
  );
  return { status, orders: rows, error, reload };
}

export function useBuyerOrder(id: string | undefined) {
  const [status, setStatus] = useState<Status>('loading');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) {
      setStatus('error');
      setError(new Error('Missing order id'));
      return;
    }

    let active = true;
    setStatus('loading');
    setError(null);

    fetchBuyerOrder(id)
      .then((result) => {
        if (!active) return;
        setOrder(result);
        setStatus(result ? 'ready' : 'error');
        if (!result) setError(new Error('Order not found'));
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

  return { status, order, error, reload };
}
