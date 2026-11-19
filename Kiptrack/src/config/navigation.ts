import type { IconName } from '@/components/icon';
import type { Locale } from '@/lib/format';

/**
 * One file drives the whole category bar. Categories that live in Supabase are
 * matched by needle against their slug and name, so renaming a category in the
 * database never requires a UI change; categories with no definition still
 * render, just with a neutral icon.
 */

export type Bilingual = Record<Locale, string>;

export type NavBadge =
  | { kind: 'new' | 'deals' | 'trending' }
  | { kind: 'text'; label: Bilingual };

/** A sub-menu entry. These are scoped searches, not invented categories. */
export type SubcategoryDefinition = {
  id: string;
  label: Bilingual;
  query: string;
};

export type CategoryDefinition = {
  /** Lower-case needles tested against a live category's slug and name. */
  match: readonly string[];
  icon: IconName;
  /** Overrides the catalogue's own name for this category. */
  label?: Bilingual;
  badge?: NavBadge;
  children?: readonly SubcategoryDefinition[];
};

export type ShortcutDefinition = {
  id: string;
  label: Bilingual;
  icon: IconName;
  href: string;
  badge?: NavBadge;
};

export type ContextualDefinition = {
  id: string;
  label: Bilingual;
  icon: IconName;
  href: string;
  badge?: NavBadge;
  /** Months (1-12) the tab appears in. Omit for all year. */
  months?: readonly number[];
  /** ISO country codes from the device. Omit to show everywhere. */
  regions?: readonly string[];
};

export type CopyKey =
  | 'all'
  | 'allHint'
  | 'browse'
  | 'recent'
  | 'shortcuts'
  | 'forYou'
  | 'customize'
  | 'customizeHint'
  | 'done'
  | 'close'
  | 'active'
  | 'searchIn'
  | 'searchPlaceholder'
  | 'searchAction'
  | 'viewAll'
  | 'newCount'
  | 'dealsCount'
  | 'trending'
  | 'pin'
  | 'unpin'
  | 'hide'
  | 'show'
  | 'hidden'
  | 'hiddenNote'
  | 'moveUp'
  | 'moveDown'
  | 'expand'
  | 'collapse'
  | 'subcategories'
  | 'offlineChip'
  | 'offlineNote'
  | 'voice'
  | 'voiceListening'
  | 'voiceNoMatch'
  | 'openCategoryHint';

export type NavigationConfig = {
  /** Hard ceiling on tabs before the row scrolls. */
  maxVisibleTabs: number;
  maxVisibleShortcuts: number;
  newWithinDays: number;
  /** Personalisation weights, applied to browsed and purchased category counts. */
  weights: { view: number; purchase: number };
  features: {
    personalization: boolean;
    customize: boolean;
    scopedSearch: boolean;
    badges: boolean;
    contextual: boolean;
    icons: boolean;
    voice: boolean;
    offline: boolean;
    lightweight: boolean;
  };
  shortcuts: readonly ShortcutDefinition[];
  contextual: readonly ContextualDefinition[];
  categories: readonly CategoryDefinition[];
  copy: Record<Locale, Record<CopyKey, string>>;
};

export const navigationConfig: NavigationConfig = {
  maxVisibleTabs: 8,
  maxVisibleShortcuts: 3,
  newWithinDays: 14,
  weights: { view: 1, purchase: 5 },
  features: {
    personalization: true,
    customize: true,
    scopedSearch: true,
    badges: true,
    contextual: true,
    icons: true,
    voice: true,
    offline: true,
    lightweight: true,
  },

  shortcuts: [
    {
      id: 'free-delivery',
      label: { en: 'Free delivery', fr: 'Livraison offerte' },
      icon: 'shipping',
      href: '/search?deals=1',
      badge: { kind: 'deals' },
    },
    {
      id: 'new',
      label: { en: 'New releases', fr: 'Nouveautés' },
      icon: 'sparkle',
      href: '/search?sort=newest',
      badge: { kind: 'new' },
    },
    {
      id: 'sell',
      label: { en: 'Sell', fr: 'Vendre' },
      icon: 'plus',
      href: '/sell',
    },
    {
      id: 'orders',
      label: { en: 'Orders', fr: 'Commandes' },
      icon: 'orders',
      href: '/orders',
    },
  ],

  contextual: [
    {
      id: 'festive',
      label: { en: 'Festive picks', fr: 'Idées fêtes' },
      icon: 'sparkle',
      href: '/search?q=gift&sort=newest',
      badge: { kind: 'trending' },
      months: [11, 12],
    },
    {
      id: 'back-to-school',
      label: { en: 'Back to school', fr: 'Rentrée' },
      icon: 'book',
      href: '/search?q=school',
      months: [8, 9],
    },
    {
      id: 'cameroon',
      label: { en: 'Made in Cameroon', fr: 'Made in Cameroun' },
      icon: 'store',
      href: '/search?q=cameroun',
      regions: ['CM'],
    },
  ],

  categories: [
    {
      match: ['electronic', 'electro', 'tech', 'phone', 'audio', 'computer'],
      icon: 'tag',
      label: { en: 'Electronics', fr: 'Électronique' },
      children: [
        { id: 'phones', label: { en: 'Phones', fr: 'Téléphones' }, query: 'phone' },
        { id: 'audio', label: { en: 'Audio', fr: 'Audio' }, query: 'headphone' },
        { id: 'computers', label: { en: 'Computers', fr: 'Ordinateurs' }, query: 'laptop' },
        { id: 'chargers', label: { en: 'Chargers', fr: 'Chargeurs' }, query: 'charger' },
      ],
    },
    {
      match: ['fashion', 'cloth', 'apparel', 'vetement', 'mode', 'shoe', 'bag'],
      icon: 'tshirt',
      label: { en: 'Fashion', fr: 'Mode' },
      children: [
        { id: 'women', label: { en: 'Women', fr: 'Femme' }, query: 'women' },
        { id: 'men', label: { en: 'Men', fr: 'Homme' }, query: 'men' },
        { id: 'shoes', label: { en: 'Shoes', fr: 'Chaussures' }, query: 'shoes' },
        { id: 'bags', label: { en: 'Bags', fr: 'Sacs' }, query: 'bag' },
      ],
    },
    {
      match: ['home', 'kitchen', 'maison', 'cuisine', 'furniture', 'decor'],
      icon: 'home',
      label: { en: 'Home & kitchen', fr: 'Maison & cuisine' },
      children: [
        { id: 'cookware', label: { en: 'Cookware', fr: 'Cuisine' }, query: 'kitchen' },
        { id: 'decor', label: { en: 'Decor', fr: 'Décoration' }, query: 'decor' },
        { id: 'furniture', label: { en: 'Furniture', fr: 'Meubles' }, query: 'chair' },
      ],
    },
    {
      match: ['beauty', 'beaute', 'cosmetic', 'soin', 'care'],
      icon: 'sparkle',
      label: { en: 'Beauty & care', fr: 'Beauté & soins' },
      children: [
        { id: 'skin', label: { en: 'Skin', fr: 'Peau' }, query: 'skin' },
        { id: 'hair', label: { en: 'Hair', fr: 'Cheveux' }, query: 'hair' },
        { id: 'fragrance', label: { en: 'Fragrance', fr: 'Parfum' }, query: 'perfume' },
      ],
    },
    {
      match: ['food', 'grocery', 'aliment', 'epicerie', 'drink', 'boisson'],
      icon: 'fork',
      label: { en: 'Food & drinks', fr: 'Alimentation' },
      children: [
        { id: 'drinks', label: { en: 'Drinks', fr: 'Boissons' }, query: 'drink' },
        { id: 'snacks', label: { en: 'Snacks', fr: 'Snacks' }, query: 'snack' },
        { id: 'pantry', label: { en: 'Pantry', fr: 'Épicerie' }, query: 'food' },
      ],
    },
    {
      match: ['sport', 'fitness', 'outdoor', 'gym'],
      icon: 'bolt',
      label: { en: 'Sports & outdoors', fr: 'Sport & plein air' },
      children: [
        { id: 'fitness', label: { en: 'Fitness', fr: 'Fitness' }, query: 'gym' },
        { id: 'football', label: { en: 'Football', fr: 'Football' }, query: 'football' },
        { id: 'outdoor', label: { en: 'Outdoors', fr: 'Plein air' }, query: 'outdoor' },
      ],
    },
    {
      match: ['book', 'livre', 'stationery', 'papeterie'],
      icon: 'book',
      label: { en: 'Books & stationery', fr: 'Livres & papeterie' },
      children: [
        { id: 'reading', label: { en: 'Reading', fr: 'Lecture' }, query: 'book' },
        { id: 'school', label: { en: 'School', fr: 'École' }, query: 'notebook' },
      ],
    },
    {
      match: ['toy', 'baby', 'jouet', 'bebe', 'enfant', 'kid'],
      icon: 'saved',
      label: { en: 'Toys & baby', fr: 'Jouets & bébé' },
      children: [
        { id: 'toys', label: { en: 'Toys', fr: 'Jouets' }, query: 'toy' },
        { id: 'baby', label: { en: 'Baby', fr: 'Bébé' }, query: 'baby' },
      ],
    },
    {
      match: ['health', 'pharma', 'sante', 'wellness'],
      icon: 'verified',
      label: { en: 'Health', fr: 'Santé' },
      children: [
        { id: 'wellness', label: { en: 'Wellness', fr: 'Bien-être' }, query: 'vitamin' },
        { id: 'first-aid', label: { en: 'First aid', fr: 'Premiers soins' }, query: 'first aid' },
      ],
    },
    {
      match: ['auto', 'car', 'moto', 'vehicle'],
      icon: 'shipping',
      label: { en: 'Auto', fr: 'Auto' },
      children: [
        { id: 'parts', label: { en: 'Parts', fr: 'Pièces' }, query: 'car part' },
        { id: 'car-care', label: { en: 'Care', fr: 'Entretien' }, query: 'car care' },
      ],
    },
    {
      match: ['art', 'craft', 'handmade', 'artisan', 'paint'],
      icon: 'palette',
      label: { en: 'Art & craft', fr: 'Art & artisanat' },
      children: [
        { id: 'handmade', label: { en: 'Handmade', fr: 'Fait main' }, query: 'handmade' },
        { id: 'supplies', label: { en: 'Supplies', fr: 'Fournitures' }, query: 'paint' },
      ],
    },
    {
      match: ['garden', 'jardin', 'plant', 'outdoor-living'],
      icon: 'leaf',
      label: { en: 'Garden', fr: 'Jardin' },
      children: [
        { id: 'plants', label: { en: 'Plants', fr: 'Plantes' }, query: 'plant' },
        { id: 'garden-tools', label: { en: 'Tools', fr: 'Outils' }, query: 'garden tool' },
      ],
    },
  ],

  copy: {
    en: {
      all: 'All',
      allHint: 'Opens every category, plus pinning and reordering',
      browse: 'Browse',
      recent: 'Recently explored',
      shortcuts: 'Shortcuts',
      forYou: 'For you',
      customize: 'Customize',
      customizeHint: 'Pin what matters, hide the rest, reorder with the arrows.',
      done: 'Done',
      close: 'Close',
      active: 'Active',
      searchIn: 'Search in {name}',
      searchPlaceholder: 'Search in {name}',
      searchAction: 'Search',
      viewAll: 'View all',
      newCount: '{count} new',
      dealsCount: '{count} deals',
      trending: 'Trending',
      pin: 'Pin {name}',
      unpin: 'Unpin {name}',
      hide: 'Hide {name} from the bar',
      show: 'Show {name} in the bar',
      hidden: 'Hidden',
      hiddenNote: 'Hidden tabs stay here, one tap away.',
      moveUp: 'Move {name} up',
      moveDown: 'Move {name} down',
      expand: 'Show {name} subcategories',
      collapse: 'Hide {name} subcategories',
      subcategories: 'subcategories',
      offlineChip: 'Offline',
      offlineNote: 'Showing the saved copy of your bar.',
      voice: 'Voice',
      voiceListening: 'Listening… say a category',
      voiceNoMatch: "Didn't catch a category. Try again.",
      openCategoryHint: 'Selects this category in the catalogue',
    },
    fr: {
      all: 'Tout',
      allHint: 'Ouvre toutes les catégories, avec épinglage et réorganisation',
      browse: 'Parcourir',
      recent: 'Exploré récemment',
      shortcuts: 'Raccourcis',
      forYou: 'Pour vous',
      customize: 'Personnaliser',
      customizeHint: 'Épinglez, masquez et réordonnez avec les flèches.',
      done: 'Terminé',
      close: 'Fermer',
      active: 'Actif',
      searchIn: 'Rechercher dans {name}',
      searchPlaceholder: 'Rechercher dans {name}',
      searchAction: 'Rechercher',
      viewAll: 'Tout voir',
      newCount: '{count} nouveaux',
      dealsCount: '{count} offres',
      trending: 'Tendance',
      pin: 'Épingler {name}',
      unpin: 'Détacher {name}',
      hide: 'Masquer {name} de la barre',
      show: 'Afficher {name} dans la barre',
      hidden: 'Masqués',
      hiddenNote: 'Les onglets masqués restent ici.',
      moveUp: 'Monter {name}',
      moveDown: 'Descendre {name}',
      expand: 'Afficher les sous-catégories de {name}',
      collapse: 'Masquer les sous-catégories de {name}',
      subcategories: 'sous-catégories',
      offlineChip: 'Hors ligne',
      offlineNote: 'Version enregistrée de votre barre.',
      voice: 'Voix',
      voiceListening: 'À l’écoute… dites une catégorie',
      voiceNoMatch: 'Aucune catégorie reconnue. Réessayez.',
      openCategoryHint: 'Sélectionne cette catégorie dans le catalogue',
    },
  },
};
