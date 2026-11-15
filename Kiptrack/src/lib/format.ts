export type Locale = 'en' | 'fr';

/**
 * Device language, narrowed to the two locales the catalogue is translated
 * into. Avoids pulling in `expo-localization` for a single string lookup.
 */
export function detectLocale(): Locale {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return locale.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Money is stored as integer minor units. XAF has no subunit, so 1 minor unit
 * is 1 XAF and amounts are always whole numbers.
 */
export function formatMoney(minor: number, locale: Locale = detectLocale()): string {
  const amount = Math.round(minor);
  try {
    return new Intl.NumberFormat(locale === 'fr' ? 'fr-CM' : 'en-CM', {
      style: 'currency',
      currency: 'XAF',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // Hermes builds without full ICU still get a readable, grouped amount.
    const grouped = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return `${grouped} XAF`;
  }
}

export function formatStock(qty: number, locale: Locale = detectLocale()): string {
  if (qty <= 0) return locale === 'fr' ? 'Rupture de stock' : 'Out of stock';
  if (qty === 1) return locale === 'fr' ? '1 en stock' : '1 in stock';
  if (qty <= 5) {
    return locale === 'fr' ? `Plus que ${qty} en stock` : `Only ${qty} left`;
  }
  return locale === 'fr' ? 'En stock' : 'In stock';
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
