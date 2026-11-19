import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  loadCatalog,
  loadProduct,
  loadRelatedProducts,
  type Catalog,
  type Product,
} from '@/lib/catalog';
import type { Locale } from '@/lib/format';

type Status = 'loading' | 'ready' | 'error';

export type CatalogState = {
  status: Status;
  data: Catalog | null;
  error: unknown;
  refreshing: boolean;
  refresh: () => void;
  reload: () => void;
};

export function useCatalog(locale: Locale): CatalogState {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      controller.current?.abort();
      const next = new AbortController();
      controller.current = next;

      if (mode === 'refresh') {
        setRefreshing(true);
      } else {
        setStatus('loading');
        setError(null);
      }

      try {
        const catalog = await loadCatalog(locale, next.signal);
        if (!mounted.current || next.signal.aborted) return;
        setData(catalog);
        setError(null);
        setStatus('ready');
      } catch (caught) {
        if (!mounted.current || next.signal.aborted) return;
        setError(caught);
        setStatus('error');
      } finally {
        if (mounted.current) setRefreshing(false);
      }
    },
    [locale]
  );

  useEffect(() => {
    run('initial');
  }, [run]);

  const refresh = useCallback(() => {
    run('refresh');
  }, [run]);

  const reload = useCallback(() => {
    if (data) {
      run('refresh');
    } else {
      run('initial');
    }
  }, [data, run]);

  return useMemo(
    () => ({ status, data, error, refreshing, refresh, reload }),
    [status, data, error, refreshing, refresh, reload]
  );
}

export type ProductState = {
  status: Status;
  product: Product | null;
  error: unknown;
  reload: () => void;
};

/**
 * Recommendations for a product page. Failures are silent: a missing rail must
 * never stop the product itself from rendering.
 */
export function useRelatedProducts(
  categoryId: string | undefined,
  excludeId: string | undefined,
): Product[] {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!categoryId || !excludeId) {
      setProducts([]);
      return;
    }

    const controller = new AbortController();
    let active = true;

    loadRelatedProducts(categoryId, excludeId, controller.signal)
      .then((next) => {
        if (active) setProducts(next);
      })
      .catch(() => {
        if (active) setProducts([]);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [categoryId, excludeId]);

  return products;
}

export function useProduct(id: string | undefined): ProductState {
  const [status, setStatus] = useState<Status>('loading');
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) {
      setStatus('error');
      setError(new Error('Missing product id'));
      return;
    }

    const next = new AbortController();
    let active = true;

    setStatus('loading');
    setError(null);

    loadProduct(id, next.signal)
      .then((result) => {
        if (!active) return;
        setProduct(result);
        setStatus(result ? 'ready' : 'error');
        if (!result) setError(new Error('Product not found'));
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught);
        setStatus('error');
      });

    return () => {
      active = false;
      next.abort();
    };
  }, [id, attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return useMemo(() => ({ status, product, error, reload }), [status, product, error, reload]);
}
