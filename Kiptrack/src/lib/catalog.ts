import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Locale } from '@/lib/format';

export type Product = {
  id: string;
  title: string;
  description: string;
  priceMinor: number;
  stockQty: number;
  images: string[];
  categoryId: string;
  featured: boolean;
  isShippingFree: boolean;
  shippingMinor: number;
  sellerId: string;
  publishedAt: string | null;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  /** Parent category id, or null for top-level categories. */
  parentId: string | null;
};

export type Catalog = {
  products: Product[];
  categories: Category[];
};

export class CatalogError extends Error {
  readonly kind: 'config' | 'network' | 'unknown';

  constructor(kind: 'config' | 'network' | 'unknown', message: string) {
    super(message);
    this.name = 'CatalogError';
    this.kind = kind;
  }
}

const PRODUCT_COLUMNS = [
  'id',
  'title',
  'description',
  'selling_price_minor',
  'stock_qty',
  'images',
  'category_id',
  'featured',
  'is_shipping_free',
  'shipping_minor',
  'seller_id',
  'published_at',
].join(',');

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  selling_price_minor: number;
  stock_qty: number;
  images: string[] | null;
  category_id: string;
  featured: boolean;
  is_shipping_free: boolean;
  shipping_minor: number;
  seller_id: string;
  published_at: string | null;
};

type CategoryRow = {
  id: string;
  slug: string;
  sort_order: number;
  parent_id: string | null;
  category_translations: { locale: string; name: string; description: string | null }[] | null;
};

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    priceMinor: row.selling_price_minor,
    stockQty: row.stock_qty,
    images: (row.images ?? []).filter(Boolean),
    categoryId: row.category_id,
    featured: row.featured,
    isShippingFree: row.is_shipping_free,
    shippingMinor: row.shipping_minor,
    sellerId: row.seller_id,
    publishedAt: row.published_at,
  };
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mapCategory(row: CategoryRow, locale: Locale): Category {
  const translations = row.category_translations ?? [];
  const match =
    translations.find((t) => t.locale === locale) ??
    translations.find((t) => t.locale === 'en') ??
    translations[0];

  return {
    id: row.id,
    slug: row.slug,
    name: match?.name ?? titleFromSlug(row.slug),
    description: match?.description ?? null,
    sortOrder: row.sort_order,
    parentId: row.parent_id ?? null,
  };
}

function toCatalogError(error: unknown): CatalogError {
  if (error instanceof CatalogError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const isNetwork = /network request failed|failed to fetch|timeout|ENOTFOUND/i.test(message);
  return new CatalogError(isNetwork ? 'network' : 'unknown', message);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && /abort/i.test(error.name + error.message);
}

export async function loadCatalog(locale: Locale, signal?: AbortSignal): Promise<Catalog> {
  if (!isSupabaseConfigured) {
    throw new CatalogError(
      'config',
      'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in the app .env file.'
    );
  }

  try {
    const [productsResult, firstCategoriesResult] = await Promise.all([
      supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('status', 'active')
        .order('featured', { ascending: false })
        .order('created_at', { ascending: false })
        .abortSignal(signal as AbortSignal),
      supabase
        .from('categories')
        .select('id,slug,sort_order,parent_id,category_translations(locale,name,description)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .abortSignal(signal as AbortSignal),
    ]);

    // Keep working against databases that pre-date the hierarchy migration.
    let categoriesResult: any = firstCategoriesResult;
    if (
      categoriesResult.error &&
      /parent_id/i.test(categoriesResult.error.message ?? '')
    ) {
      categoriesResult = await supabase
        .from('categories')
        .select('id,slug,sort_order,category_translations(locale,name,description)')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .abortSignal(signal as AbortSignal);
    }

    if (productsResult.error) throw productsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;

    const products = ((productsResult.data ?? []) as unknown as ProductRow[]).map(mapProduct);
    const categories = ((categoriesResult.data ?? []) as unknown as CategoryRow[])
      .map((row) => mapCategory(row, locale))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return { products, categories };
  } catch (error) {
    if (isAbort(error)) throw error;
    throw toCatalogError(error);
  }
}

export async function loadProduct(id: string, signal?: AbortSignal): Promise<Product | null> {
  if (!isSupabaseConfigured) {
    throw new CatalogError(
      'config',
      'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in the app .env file.'
    );
  }

  try {
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('id', id)
      .eq('status', 'active')
      .abortSignal(signal as AbortSignal)
      .maybeSingle();

    if (error) throw error;
    return data ? mapProduct(data as unknown as ProductRow) : null;
  } catch (error) {
    if (isAbort(error)) throw error;
    throw toCatalogError(error);
  }
}

/**
 * Items to recommend beside a product: same category, newest and featured
 * first, never the product being viewed.
 */
export async function loadRelatedProducts(
  categoryId: string,
  excludeId: string,
  signal?: AbortSignal,
): Promise<Product[]> {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('status', 'active')
    .eq('category_id', categoryId)
    .neq('id', excludeId)
    .order('featured', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(8)
    .abortSignal(signal as AbortSignal);

  if (error) throw error;
  return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
}

/**
 * Category ids for the given products, used to weight the category bar after a
 * purchase. Failures are silent: personalisation must never block an order.
 */
export async function loadProductCategories(ids: string[]): Promise<string[]> {
  if (!isSupabaseConfigured || ids.length === 0) return [];

  const { data, error } = await supabase
    .from('products')
    .select('id,category_id')
    .in('id', [...new Set(ids)]);

  if (error) throw error;
  const rows = (data ?? []) as unknown as { id: string; category_id: string }[];
  return [...new Set(rows.map((row) => row.category_id).filter(Boolean))];
}

export function errorMessage(error: unknown, locale: Locale): string {
  const kind = error instanceof CatalogError ? error.kind : 'unknown';
  if (kind === 'config') {
    return locale === 'fr'
      ? 'La configuration Supabase est absente du fichier .env.'
      : 'Supabase is not configured in the app .env file.';
  }
  if (kind === 'network') {
    return locale === 'fr'
      ? 'Impossible de joindre le catalogue. Vérifiez votre connexion.'
      : "Can't reach the catalogue. Check your connection and try again.";
  }
  return locale === 'fr'
    ? 'Le catalogue est momentanément indisponible.'
    : 'The catalogue is temporarily unavailable.';
}
