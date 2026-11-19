import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  navigationConfig,
  type CategoryDefinition,
  type ContextualDefinition,
  type NavBadge,
  type ShortcutDefinition,
  type SubcategoryDefinition,
} from '@/config/navigation';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, ScreenPadding, Spacing, TouchTarget } from '@/constants/theme';
import { useResolvedScheme, useTheme } from '@/hooks/use-theme';
import type { Product } from '@/lib/catalog';
import { detectLocale } from '@/lib/format';
import { useNav } from '@/state/nav';

const locale = detectLocale();
const config = navigationConfig;
const copy = config.copy[locale];

export type NavCategory = { id: string; name: string; slug: string; parentId: string | null };

type Props = {
  categories: NavCategory[];
  products?: Product[];
  activeCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
};

/** Replaces `{token}` placeholders in config copy. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''));
}

/** Lower-cased, accent-folded text so spoken "electronique" matches "Électronique". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function definitionFor(category: NavCategory): CategoryDefinition | undefined {
  const haystack = `${category.slug} ${category.name}`.toLowerCase();
  return config.categories.find((definition) =>
    definition.match.some((needle) => haystack.includes(needle)),
  );
}

function labelFor(category: NavCategory): string {
  return definitionFor(category)?.label?.[locale] ?? category.name;
}

/** Real subcategories come from the database; config children are search shortcuts. */
function childrenOf(category: NavCategory, source: NavCategory[]): NavCategory[] {
  return source.filter((candidate) => candidate.parentId === category.id);
}

/** Best-effort region from the device clock, used by contextual tabs. */
function detectRegion(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === 'Africa/Douala') return 'CM';
    if (zone === 'Africa/Lagos') return 'NG';
  } catch {
    // Intl is always present in the runtimes we target; keep the fallback anyway.
  }

  try {
    const [, region] = Intl.DateTimeFormat().resolvedOptions().locale.split('-');
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  } catch {
    // Ignore and fall through to "unknown".
  }

  return null;
}

type RecognitionResultEvent = { results?: ArrayLike<ArrayLike<{ transcript?: string }>> };

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => RecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  const scope = globalThis as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function createRecognition(): RecognitionLike | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) =>
      setReduced(value),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/** Data-saver or 2G connections get the same UI without the motion. */
function useSlowConnection(): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const connection = (
      globalThis as {
        navigator?: { connection?: { saveData?: boolean; effectiveType?: string } };
      }
    ).navigator?.connection;

    if (!connection) return;
    if (connection.saveData) setSlow(true);
    if (connection.effectiveType === '2g' || connection.effectiveType === 'slow-2g') {
      setSlow(true);
    }
  }, []);

  return slow;
}

export function CategoryNav({
  categories,
  products,
  activeCategoryId,
  onSelectCategory,
}: Props) {
  const theme = useTheme();
  const scheme = useResolvedScheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const nav = useNav();
  const reducedMotion = useReducedMotion();
  const slowConnection = useSlowConnection();
  const animate = reducedMotion || (config.features.lightweight && slowConnection) ? false : true;

  const productList = useMemo(() => products ?? [], [products]);
  const offline = config.features.offline && categories.length === 0 && nav.cached.length > 0;
  const source = useMemo<NavCategory[]>(
    () => (categories.length > 0 ? categories : (nav.cached as NavCategory[])),
    [categories, nav.cached],
  );

  const byId = useMemo(() => new Map(source.map((category) => [category.id, category])), [source]);

  const ordered = useMemo(() => {
    const seen = new Set<string>();
    const arranged: NavCategory[] = [];

    for (const id of nav.order) {
      const category = byId.get(id);
      if (category && !seen.has(id)) {
        arranged.push(category);
        seen.add(id);
      }
    }

    const rest = source.filter((category) => !seen.has(category.id));

    if (config.features.personalization) {
      const score = (id: string) =>
        (nav.activity.views[id] ?? 0) * config.weights.view +
        (nav.activity.purchases[id] ?? 0) * config.weights.purchase;
      rest.sort((a, b) => score(b.id) - score(a.id));
    }

    return [...arranged, ...rest];
  }, [byId, source, nav.order, nav.activity.views, nav.activity.purchases]);

  const pinned = useMemo(
    () =>
      nav.pins
        .map((id) => byId.get(id))
        .filter((category): category is NavCategory => Boolean(category)),
    [nav.pins, byId],
  );

  const displayOrder = useMemo(
    () => [...pinned, ...ordered.filter((category) => !nav.pins.includes(category.id))],
    [pinned, ordered, nav.pins],
  );

  const barCategories = useMemo(
    () => displayOrder.filter((category) => !nav.hidden.includes(category.id)),
    [displayOrder, nav.hidden],
  );

  const month = new Date().getMonth() + 1;
  const [region, setRegion] = useState<string | null>(() => detectRegion());

  useEffect(() => {
    const geo = (globalThis as { navigator?: { geolocation?: { getCurrentPosition: (success: (position: { coords: { latitude: number; longitude: number } }) => void, error?: () => void, options?: { timeout?: number; maximumAge?: number } ) => void } } }).navigator?.geolocation;
    if (!geo) return;
    geo.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (latitude >= 1.5 && latitude <= 13.5 && longitude >= 8 && longitude <= 16.5) {
          setRegion('CM');
        }
      },
      () => {},
      { timeout: 4000, maximumAge: 600_000 },
    );
  }, []);

  const contextualTabs = useMemo(
    () =>
      config.features.contextual
        ? config.contextual.filter(
            (entry) =>
              (!entry.months || entry.months.includes(month)) &&
              (!entry.regions || (region !== null && entry.regions.includes(region))),
          )
        : [],
    [month, region],
  );

  const shortcutTabs = config.shortcuts.slice(
    0,
    Math.min(config.maxVisibleShortcuts, config.maxVisibleTabs),
  );
  const visibleContextual = contextualTabs.slice(
    0,
    Math.max(0, Math.min(2, config.maxVisibleTabs - shortcutTabs.length)),
  );
  const categorySlots = Math.max(
    0,
    config.maxVisibleTabs - shortcutTabs.length - visibleContextual.length,
  );
  const visibleCategories = barCategories.slice(0, categorySlots);

  const activeCategory = activeCategoryId ? byId.get(activeCategoryId) : undefined;

  const newCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const windowMs = config.newWithinDays * 86_400_000;
    const now = Date.now();

    for (const product of productList) {
      if (!product.publishedAt) continue;
      const published = Date.parse(product.publishedAt);
      if (Number.isNaN(published) || now - published > windowMs || now < published) continue;
      counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    }

    return counts;
  }, [productList]);

  const newTotal = useMemo(
    () => [...newCounts.values()].reduce((sum, value) => sum + value, 0),
    [newCounts],
  );

  const dealsTotal = useMemo(
    () => productList.filter((product) => product.isShippingFree && product.stockQty > 0).length,
    [productList],
  );

  const dealsFor = (categoryId: string) =>
    productList.filter(
      (product) =>
        product.categoryId === categoryId && product.isShippingFree && product.stockQty > 0,
    ).length;

  const resolveBadge = (badge: NavBadge, scopeId?: string): string | null => {
    if (badge.kind === 'text') return badge.label[locale];

    if (badge.kind === 'new') {
      const count = scopeId ? newCounts.get(scopeId) ?? 0 : newTotal;
      return count > 0 ? fill(copy.newCount, { count }) : null;
    }

    if (badge.kind === 'deals') {
      const count = scopeId ? dealsFor(scopeId) : dealsTotal;
      return count > 0 ? fill(copy.dealsCount, { count }) : null;
    }

    return copy.trending;
  };

  const categoryBadge = (category: NavCategory): string | null => {
    if (!config.features.badges || productList.length === 0) return null;

    const configured = definitionFor(category)?.badge;
    if (configured) return resolveBadge(configured, category.id);

    const count = newCounts.get(category.id) ?? 0;
    return count > 0 ? fill(copy.newCount, { count }) : null;
  };

  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  const [panelQuery, setPanelQuery] = useState('');
  const [drawerQuery, setDrawerQuery] = useState('');

  const filteredBrowse = useMemo(() => {
    const needle = fold(drawerQuery);
    if (!needle) return displayOrder;
    return displayOrder.filter((category) => fold(labelFor(category)).includes(needle));
  }, [displayOrder, drawerQuery]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'error'>('idle');
  const [speechSupported] = useState(() => getRecognitionCtor() !== null);
  const recognition = useRef<RecognitionLike | null>(null);
  const barRef = useRef<any>(null);
  const drawerRef = useRef<any>(null);

  const panelProgress = useRef(new Animated.Value(0)).current;
  const drawerProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!openPanelId) return;
    if (!animate) {
      panelProgress.setValue(1);
      return;
    }
    panelProgress.setValue(0);
    Animated.timing(panelProgress, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [openPanelId, animate, panelProgress]);

  useEffect(() => {
    setPanelQuery('');
  }, [openPanelId]);

  useEffect(() => {
    if (!drawerOpen) return;
    if (!animate) {
      drawerProgress.setValue(1);
      return;
    }
    drawerProgress.setValue(0);
    Animated.timing(drawerProgress, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [drawerOpen, animate, drawerProgress]);

  // Keep a copy of the taxonomy for the next cold start without a network.
  const saveCached = nav.saveCached;
  useEffect(() => {
    if (categories.length === 0) return;
    saveCached(categories.map(({ id, name, slug, parentId }) => ({ id, name, slug, parentId })));
  }, [categories, saveCached]);

  useEffect(
    () => () => {
      try {
        recognition.current?.abort();
      } catch {
        // The engine may already be stopped.
      }
    },
    [],
  );

  const closeDrawer = useCallback(() => {
    try {
      recognition.current?.abort();
    } catch {
      // Ignore engines that were never started.
    }
    recognition.current = null;
    setVoiceState('idle');

    if (!animate) {
      setDrawerOpen(false);
      return;
    }

    Animated.timing(drawerProgress, {
      toValue: 0,
      duration: 150,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setDrawerOpen(false);
    });
  }, [animate, drawerProgress]);

  // Escape closes the panel or drawer on web; Tab and Enter work natively.
  useEffect(() => {
    if (!openPanelId && !drawerOpen) return;

    const doc = (
      globalThis as {
        document?: {
          addEventListener: (type: string, listener: (event: { key?: string }) => void) => void;
          removeEventListener: (type: string, listener: (event: { key?: string }) => void) => void;
        };
      }
    ).document;

    if (!doc) return;

    const onKeyDown = (event: { key?: string }) => {
      if (event.key !== 'Escape') return;
      if (openPanelId) setOpenPanelId(null);
      else if (drawerOpen) closeDrawer();
    };

    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, [openPanelId, drawerOpen, closeDrawer]);

  // Roving focus for keyboard users on web: arrows move between tabs and rows.
  useEffect(() => {
    const doc = (globalThis as { document?: any }).document;
    if (!doc) return;

    const handler = (event: any) => {
      const active = doc.activeElement;
      const inBar = Boolean(barRef.current?.contains?.(active));
      const inDrawer = Boolean(drawerOpen && drawerRef.current?.contains?.(active));
      if (!inBar && !inDrawer) return;

      const root = inDrawer ? drawerRef.current : barRef.current;
      const buttons = Array.from(
        root.querySelectorAll('button, [role="button"]'),
      ) as any[];
      const index = buttons.indexOf(active);
      if (index < 0) return;

      let next = index;
      if (inDrawer) {
        if (event.key === 'ArrowDown') next = Math.min(buttons.length - 1, index + 1);
        else if (event.key === 'ArrowUp') next = Math.max(0, index - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
      } else {
        if (event.key === 'ArrowRight') next = Math.min(buttons.length - 1, index + 1);
        else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
      }

      event.preventDefault();
      buttons[next]?.focus?.();
    };

    doc.addEventListener('keydown', handler);
    return () => doc.removeEventListener('keydown', handler);
  }, [drawerOpen]);

  const recordView = nav.recordView;
  const selectCategory = useCallback(
    (category: NavCategory) => {
      onSelectCategory(category.id);
      recordView({ id: category.id, name: category.name, slug: category.slug, parentId: category.parentId });
    },
    [onSelectCategory, recordView],
  );

  const go = (href: string) => {
    router.push(href as Parameters<typeof router.push>[0]);
  };

  const searchIn = (category: NavCategory, query?: string) => {
    recordView({ id: category.id, name: category.name, slug: category.slug, parentId: category.parentId });
    router.push({
      pathname: '/search',
      params: {
        category: category.id,
        focus: '1',
        ...(query ? { q: query } : {}),
      },
    });
    setOpenPanelId(null);
  };

  const onCategoryPress = (category: NavCategory) => {
    const hasChildren =
      childrenOf(category, source).length > 0 ||
      Boolean(definitionFor(category)?.children?.length);

    if (activeCategoryId === category.id) {
      setOpenPanelId(hasChildren && openPanelId !== category.id ? category.id : null);
      return;
    }

    selectCategory(category);
    setOpenPanelId(hasChildren ? category.id : null);
  };

  const matchSpoken = (transcript: string): NavCategory | null => {
    const needle = fold(transcript).replace(/^(the|le|la|les)\s+/, '');
    if (!needle) return null;

    const match = source.find((category) => {
      const haystack = fold(`${labelFor(category)} ${category.name} ${category.slug}`);
      return haystack.includes(needle) || needle.includes(haystack);
    });

    return match ?? null;
  };

  const startVoice = () => {
    const instance = createRecognition();
    if (!instance) {
      setVoiceState('error');
      return;
    }

    try {
      recognition.current?.abort();
    } catch {
      // Nothing to stop.
    }

    instance.lang = locale === 'fr' ? 'fr-FR' : 'en-US';
    instance.interimResults = false;
    instance.maxAlternatives = 1;

    instance.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? '';
      const match = matchSpoken(transcript);
      recognition.current = null;
      setVoiceState('idle');

      if (!match) {
        setVoiceState('error');
        return;
      }

      closeDrawer();
      selectCategory(match);
    };

    instance.onerror = () => {
      recognition.current = null;
      setVoiceState('error');
    };

    instance.onend = () => {
      recognition.current = null;
      setVoiceState((current) => (current === 'listening' ? 'idle' : current));
    };

    recognition.current = instance;
    setVoiceState('listening');

    try {
      instance.start();
    } catch {
      recognition.current = null;
      setVoiceState('error');
    }
  };

  const openPanelCategory = openPanelId ? byId.get(openPanelId) : undefined;
  const openPanelDbChildren = openPanelCategory ? childrenOf(openPanelCategory, source) : [];
  const openPanelConfigChildren = openPanelCategory
    ? definitionFor(openPanelCategory)?.children ?? []
    : [];
  const openPanel =
    openPanelCategory &&
    (openPanelDbChildren.length > 0 || openPanelConfigChildren.length > 0)
      ? {
          category: openPanelCategory,
          dbChildren: openPanelDbChildren,
          configChildren: openPanelConfigChildren,
        }
      : null;

  const recentCategories = useMemo(
    () =>
      nav.recent
        .map((entry) => byId.get(entry.id))
        .filter((category): category is NavCategory => Boolean(category))
        .slice(0, 6),
    [nav.recent, byId],
  );

  const hoverTint = scheme === 'dark' ? 'rgba(18,19,22,0.10)' : 'rgba(255,255,255,0.15)';
  const drawerWidth = Math.min(340, Math.max(272, Math.round(width * 0.86)));
  const customizeIds = displayOrder.map((category) => category.id);
  const customizeVisible = displayOrder.filter((category) => !nav.hidden.includes(category.id));
  const customizeHidden = displayOrder.filter((category) => nav.hidden.includes(category.id));

  const badgeChip = (text: string | null, onAccent: boolean) => {
    if (!text) return null;
    return (
      <View
        style={[
          styles.badge,
          { backgroundColor: onAccent ? theme.onAccent : theme.accent },
        ]}>
        <ThemedText
          variant="caption"
          tone={onAccent ? 'accent' : 'onAccent'}
          style={styles.badgeText}>
          {text}
        </ThemedText>
      </View>
    );
  };

  const hoverProps = (id: string) => ({
    onHoverIn: () => setHoveredId(id),
    onHoverOut: () => setHoveredId(null),
  });

  const categoryTab = (category: NavCategory) => {
    const definition = definitionFor(category);
    const selected = activeCategoryId === category.id;
    const badge = categoryBadge(category);
    const hasChildren =
      childrenOf(category, source).length > 0 || Boolean(definition?.children?.length);
    const key = `cat:${category.id}`;
    const hovered = hoveredId === key;
    const name = labelFor(category);

    return (
      <Pressable
        key={category.id}
        accessibilityRole="button"
        accessibilityLabel={`${name}${badge ? `, ${badge}` : ''}`}
        accessibilityHint={hasChildren ? copy.openCategoryHint : undefined}
        accessibilityState={{
          selected,
          expanded: hasChildren ? openPanelId === category.id : undefined,
        }}
        onPress={() => onCategoryPress(category)}
        {...hoverProps(key)}
        style={({ pressed }) => [
          styles.tab,
          hovered && !selected && { backgroundColor: hoverTint },
          selected && { backgroundColor: theme.accent },
          pressed && styles.pressed,
        ]}>
        {config.features.icons && definition ? (
          <Icon
            name={definition.icon}
            size={14}
            color={selected ? theme.onAccent : theme.onPrimary}
          />
        ) : null}
        <ThemedText
          variant="footnote"
          tone={selected ? 'onAccent' : 'onPrimary'}
          numberOfLines={1}
          style={styles.tabLabel}>
          {name}
        </ThemedText>
        {badgeChip(badge, selected)}
        {hasChildren ? (
          <Icon
            name={openPanelId === category.id ? 'chevronUp' : 'chevronDown'}
            size={11}
            color={selected ? theme.onAccent : theme.onPrimary}
          />
        ) : null}
      </Pressable>
    );
  };

  const shortcutTab = (shortcut: ShortcutDefinition) => {
    const badge =
      config.features.badges && shortcut.badge ? resolveBadge(shortcut.badge) : null;
    const key = `link:${shortcut.id}`;
    const hovered = hoveredId === key;

    return (
      <Pressable
        key={shortcut.id}
        accessibilityRole="button"
        accessibilityLabel={`${shortcut.label[locale]}${badge ? `, ${badge}` : ''}`}
        onPress={() => {
          setOpenPanelId(null);
          go(shortcut.href);
        }}
        {...hoverProps(key)}
        style={({ pressed }) => [
          styles.tab,
          hovered && { backgroundColor: hoverTint },
          pressed && styles.pressed,
        ]}>
        {config.features.icons ? (
          <Icon name={shortcut.icon} size={14} color={theme.onPrimary} />
        ) : null}
        <ThemedText variant="footnote" tone="onPrimary" numberOfLines={1} style={styles.tabLabel}>
          {shortcut.label[locale]}
        </ThemedText>
        {badgeChip(badge, false)}
      </Pressable>
    );
  };

  const contextualTab = (entry: ContextualDefinition) => {
    const badge = config.features.badges && entry.badge ? resolveBadge(entry.badge) : null;
    const key = `ctx:${entry.id}`;
    const hovered = hoveredId === key;

    return (
      <Pressable
        key={entry.id}
        accessibilityRole="button"
        accessibilityLabel={`${entry.label[locale]}${badge ? `, ${badge}` : ''}`}
        onPress={() => {
          setOpenPanelId(null);
          go(entry.href);
        }}
        {...hoverProps(key)}
        style={({ pressed }) => [
          styles.tab,
          styles.contextual,
          { borderColor: theme.accent },
          hovered && { backgroundColor: hoverTint },
          pressed && styles.pressed,
        ]}>
        {config.features.icons ? (
          <Icon name={entry.icon} size={14} color={theme.accent} />
        ) : null}
        <ThemedText variant="footnote" tone="onPrimary" numberOfLines={1} style={styles.tabLabel}>
          {entry.label[locale]}
        </ThemedText>
        {badgeChip(badge, false)}
      </Pressable>
    );
  };

  const section = (title: string, rows: ReactNode) => (
    <View style={styles.section}>
      <ThemedText variant="caption" tone="textTertiary" style={styles.sectionLabel}>
        {title.toUpperCase()}
      </ThemedText>
      <View
        style={[styles.sectionBody, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {rows}
      </View>
    </View>
  );

  const categoryDrawerRow = (category: NavCategory) => {
    const definition = definitionFor(category);
    const dbChildren = childrenOf(category, source);
    const configChildren = definition?.children ?? [];
    const hasChildren = dbChildren.length > 0 || configChildren.length > 0;
    const expanded = expandedId === category.id;
    const name = labelFor(category);
    const active = activeCategoryId === category.id;

    return (
      <View key={category.id}>
        <View style={[styles.drawerRow, { borderBottomColor: theme.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}${active ? `, ${copy.active}` : ''}`}
            accessibilityHint={copy.openCategoryHint}
            accessibilityState={{ selected: active }}
            onPress={() => {
              selectCategory(category);
              closeDrawer();
            }}
            style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
            <Icon name={definition?.icon ?? 'tag'} size={18} color={theme.textSecondary} />
            <ThemedText variant="callout" numberOfLines={1} style={styles.rowLabel}>
              {name}
            </ThemedText>
            {active ? (
              <ThemedText variant="caption" tone="accentText">
                {copy.active}
              </ThemedText>
            ) : null}
          </Pressable>

          {hasChildren ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={fill(expanded ? copy.collapse : copy.expand, { name })}
              accessibilityState={{ expanded }}
              hitSlop={8}
              onPress={() => setExpandedId(expanded ? null : category.id)}
              style={styles.iconButton}>
              <Icon
                name={expanded ? 'chevronUp' : 'chevronDown'}
                size={14}
                color={theme.textTertiary}
              />
            </Pressable>
          ) : null}
        </View>

        {expanded && dbChildren.length > 0
          ? dbChildren.map((child) => (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={labelFor(child)}
                onPress={() => {
                  selectCategory(child);
                  closeDrawer();
                }}
                style={({ pressed }) => [
                  styles.drawerChild,
                  { borderBottomColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <Icon
                  name={definitionFor(child)?.icon ?? 'tag'}
                  size={13}
                  color={theme.textTertiary}
                />
                <ThemedText variant="footnote" tone="textSecondary">
                  {labelFor(child)}
                </ThemedText>
              </Pressable>
            ))
          : null}

        {expanded && dbChildren.length === 0 && configChildren.length > 0
          ? configChildren.map((child: SubcategoryDefinition) => (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={fill(copy.searchIn, { name: child.label[locale] })}
                onPress={() => {
                  searchIn(category, child.query);
                  closeDrawer();
                }}
                style={({ pressed }) => [
                  styles.drawerChild,
                  { borderBottomColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <Icon name="search" size={13} color={theme.textTertiary} />
                <ThemedText variant="footnote" tone="textSecondary">
                  {child.label[locale]}
                </ThemedText>
              </Pressable>
            ))
          : null}
      </View>
    );
  };

  const customizeRow = (category: NavCategory) => {
    const definition = definitionFor(category);
    const name = labelFor(category);
    const pinned = nav.pins.includes(category.id);
    const hidden = nav.hidden.includes(category.id);
    const index = customizeIds.indexOf(category.id);

    return (
      <View
        key={category.id}
        style={[styles.drawerRow, { borderBottomColor: theme.border }]}>
        <Icon name={definition?.icon ?? 'tag'} size={18} color={theme.textSecondary} />
        <ThemedText variant="callout" numberOfLines={1} style={styles.rowLabel}>
          {name}
        </ThemedText>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fill(pinned ? copy.unpin : copy.pin, { name })}
          accessibilityState={{ selected: pinned }}
          hitSlop={6}
          onPress={() => nav.togglePin(category.id)}
          style={[styles.iconButton, pinned && { backgroundColor: theme.surfaceRaised }]}>
          <Icon
            name="pin"
            size={16}
            color={pinned ? theme.accentStrong : theme.textTertiary}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fill(copy.moveUp, { name })}
          accessibilityState={{ disabled: index <= 0 }}
          disabled={index <= 0}
          hitSlop={6}
          onPress={() => nav.moveCategory(category.id, -1, customizeIds)}
          style={styles.iconButton}>
          <Icon
            name="arrowUp"
            size={16}
            color={index <= 0 ? theme.skeleton : theme.textSecondary}
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fill(copy.moveDown, { name })}
          accessibilityState={{ disabled: index < 0 || index >= customizeIds.length - 1 }}
          disabled={index < 0 || index >= customizeIds.length - 1}
          hitSlop={6}
          onPress={() => nav.moveCategory(category.id, 1, customizeIds)}
          style={styles.iconButton}>
          <Icon
            name="arrowDown"
            size={16}
            color={
              index < 0 || index >= customizeIds.length - 1
                ? theme.skeleton
                : theme.textSecondary
            }
          />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fill(hidden ? copy.show : copy.hide, { name })}
          accessibilityState={{ selected: hidden }}
          hitSlop={6}
          onPress={() => nav.toggleHidden(category.id)}
          style={styles.iconButton}>
          <Icon
            name={hidden ? 'eyeOff' : 'eye'}
            size={16}
            color={hidden ? theme.accentStrong : theme.textSecondary}
          />
        </Pressable>
      </View>
    );
  };

  const shortcutDrawerRow = (shortcut: ShortcutDefinition) => {
    const badge =
      config.features.badges && shortcut.badge ? resolveBadge(shortcut.badge) : null;

    return (
      <Pressable
        key={shortcut.id}
        accessibilityRole="button"
        accessibilityLabel={shortcut.label[locale]}
        onPress={() => {
          closeDrawer();
          go(shortcut.href);
        }}
        style={({ pressed }) => [
          styles.drawerRow,
          { borderBottomColor: theme.border },
          pressed && styles.pressed,
        ]}>
        <Icon name={shortcut.icon} size={18} color={theme.textSecondary} />
        <ThemedText variant="callout" style={styles.rowLabel}>
          {shortcut.label[locale]}
        </ThemedText>
        {badge ? (
          <ThemedText variant="caption" tone="textTertiary">
            {badge}
          </ThemedText>
        ) : null}
        <Icon name="chevron" size={13} color={theme.textTertiary} />
      </Pressable>
    );
  };

  const contextualDrawerRow = (entry: ContextualDefinition) => (
    <Pressable
      key={entry.id}
      accessibilityRole="button"
      accessibilityLabel={entry.label[locale]}
      onPress={() => {
        closeDrawer();
        go(entry.href);
      }}
      style={({ pressed }) => [
        styles.drawerRow,
        { borderBottomColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <Icon name={entry.icon} size={18} color={theme.accentStrong} />
      <ThemedText variant="callout" style={styles.rowLabel}>
        {entry.label[locale]}
      </ThemedText>
      <Icon name="chevron" size={13} color={theme.textTertiary} />
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <View ref={barRef} style={[styles.bar, { backgroundColor: theme.primary }]}>
        <View style={[styles.barInner, { maxWidth: MaxContentWidth }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy.all}, ${copy.allHint}`}
            accessibilityState={{ expanded: drawerOpen }}
            onPress={() => {
              setExpandedId(null);
              setDrawerOpen(true);
            }}
            {...hoverProps('all')}
            style={({ pressed }) => [
              styles.allButton,
              hoveredId === 'all' && { backgroundColor: hoverTint },
              pressed && styles.pressed,
            ]}>
            <Icon name="menu" size={18} color={theme.onPrimary} />
            <ThemedText variant="bodyStrong" tone="onPrimary">
              {copy.all}
            </ThemedText>
            <Icon name="chevronDown" size={11} color={theme.onPrimary} />
            {offline ? (
              <View style={[styles.offlineDot, { backgroundColor: theme.accent }]} />
            ) : null}
          </Pressable>

          <View style={[styles.divider, { backgroundColor: theme.onPrimary }]} />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.tabs}>
            {activeCategory && config.features.scopedSearch ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={fill(copy.searchIn, { name: labelFor(activeCategory) })}
                onPress={() => searchIn(activeCategory)}
                {...hoverProps('quick-search')}
                style={({ pressed }) => [
                  styles.quickSearch,
                  { borderColor: theme.onPrimary },
                  hoveredId === 'quick-search' && { backgroundColor: hoverTint },
                  pressed && styles.pressed,
                ]}>
                <Icon name="search" size={14} color={theme.onPrimary} />
                {width >= 700 ? (
                  <ThemedText variant="footnote" tone="onPrimary">
                    {copy.searchAction}
                  </ThemedText>
                ) : null}
              </Pressable>
            ) : null}

            {shortcutTabs.map(shortcutTab)}
            {visibleContextual.map(contextualTab)}
            {visibleCategories.map(categoryTab)}
          </ScrollView>
        </View>
      </View>

      {openPanel ? (
        <Animated.View
          style={[
            styles.panel,
            {
              backgroundColor: theme.background,
              borderBottomColor: theme.border,
              opacity: panelProgress,
              transform: [
                {
                  translateY: panelProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-6, 0],
                  }),
                },
              ],
            },
          ]}>
          <View style={[styles.panelInner, { maxWidth: MaxContentWidth }]}>
            <View style={styles.panelHeader}>
              <ThemedText variant="bodyStrong">{labelFor(openPanel.category)}</ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.close}
                hitSlop={8}
                onPress={() => setOpenPanelId(null)}
                style={styles.iconButton}>
                <Icon name="close" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>

            <View
              style={[
                styles.panelSearch,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              <Icon name="search" size={16} color={theme.textTertiary} />
              <TextInput
                value={panelQuery}
                onChangeText={setPanelQuery}
                placeholder={fill(copy.searchPlaceholder, {
                  name: labelFor(openPanel.category),
                })}
                placeholderTextColor={theme.textTertiary}
                selectionColor={theme.accentStrong}
                returnKeyType="search"
                autoCorrect={false}
                accessibilityLabel={fill(copy.searchIn, {
                  name: labelFor(openPanel.category),
                })}
                onSubmitEditing={() =>
                  searchIn(openPanel.category, panelQuery.trim() || undefined)
                }
                style={[styles.panelInput, { color: theme.text }]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.searchAction}
                hitSlop={8}
                onPress={() => searchIn(openPanel.category, panelQuery.trim() || undefined)}
                style={styles.panelSearchAction}>
                <ThemedText variant="footnote" tone="accentText">
                  {copy.searchAction}
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.childWrap}>
              {openPanel.dbChildren.length > 0
                ? openPanel.dbChildren.map((child) => (
                    <Pressable
                      key={child.id}
                      accessibilityRole="button"
                      accessibilityLabel={labelFor(child)}
                      onPress={() => {
                        selectCategory(child);
                        setOpenPanelId(null);
                      }}
                      style={({ pressed }) => [
                        styles.childChip,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                        pressed && styles.pressed,
                      ]}>
                      <Icon
                        name={definitionFor(child)?.icon ?? 'tag'}
                        size={12}
                        color={theme.textTertiary}
                      />
                      <ThemedText variant="footnote">{labelFor(child)}</ThemedText>
                    </Pressable>
                  ))
                : openPanel.configChildren.map((child) => (
                    <Pressable
                      key={child.id}
                      accessibilityRole="button"
                      accessibilityLabel={fill(copy.searchIn, { name: child.label[locale] })}
                      onPress={() => searchIn(openPanel.category, child.query)}
                      style={({ pressed }) => [
                        styles.childChip,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                        pressed && styles.pressed,
                      ]}>
                      <Icon name="search" size={12} color={theme.textTertiary} />
                      <ThemedText variant="footnote">{child.label[locale]}</ThemedText>
                    </Pressable>
                  ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${copy.viewAll}: ${labelFor(openPanel.category)}`}
                onPress={() => {
                  selectCategory(openPanel.category);
                  setOpenPanelId(null);
                }}
                style={({ pressed }) => [styles.viewAll, pressed && styles.pressed]}>
                <ThemedText variant="footnote" tone="accentText">
                  {copy.viewAll}
                </ThemedText>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}

      <Modal
        visible={drawerOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeDrawer}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.backdrop, { opacity: drawerProgress }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.close}
              style={StyleSheet.absoluteFill}
              onPress={closeDrawer}
            />
          </Animated.View>

          <Animated.View
            ref={drawerRef}
            accessibilityViewIsModal
            style={[
              styles.drawer,
              {
                width: drawerWidth,
                backgroundColor: theme.background,
                borderRightColor: theme.border,
                paddingTop: insets.top + Spacing.two,
                transform: [
                  {
                    translateX: drawerProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-drawerWidth, 0],
                    }),
                  },
                ],
              },
            ]}>
            <View style={styles.drawerHeader}>
              <ThemedText variant="headline" accessibilityRole="header">
                {copy.all}
              </ThemedText>
              <View style={styles.drawerHeaderActions}>
                {config.features.voice && speechSupported ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.voice}
                    onPress={startVoice}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                    <Icon
                      name="mic"
                      size={18}
                      color={voiceState === 'listening' ? theme.accentStrong : theme.textSecondary}
                    />
                  </Pressable>
                ) : null}
                {config.features.customize ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={editing ? copy.done : copy.customize}
                    accessibilityState={{ selected: editing }}
                    onPress={() => setEditing((value) => !value)}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                    <Icon
                      name={editing ? 'verified' : 'tune'}
                      size={18}
                      color={editing ? theme.accentStrong : theme.textSecondary}
                    />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.close}
                  onPress={closeDrawer}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                  <Icon name="close" size={18} color={theme.textSecondary} />
                </Pressable>
              </View>
            </View>

            {voiceState === 'listening' ? (
              <View style={styles.voiceRow} accessibilityLiveRegion="polite">
                <Icon name="mic" size={16} color={theme.accentStrong} />
                <ThemedText variant="footnote" tone="textSecondary" style={styles.rowLabel}>
                  {copy.voiceListening}
                </ThemedText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.close}
                  hitSlop={8}
                  onPress={closeDrawer}>
                  <Icon name="close" size={14} color={theme.textSecondary} />
                </Pressable>
              </View>
            ) : null}

            {voiceState === 'error' ? (
              <ThemedText
                variant="footnote"
                tone="danger"
                accessibilityRole="alert"
                style={styles.hint}>
                {copy.voiceNoMatch}
              </ThemedText>
            ) : null}

            <View style={styles.drawerSearchWrap}>
              <View
                style={[
                  styles.drawerSearch,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}>
                <Icon name="search" size={16} color={theme.textTertiary} />
                <TextInput
                  value={drawerQuery}
                  onChangeText={setDrawerQuery}
                  placeholder={copy.searchPlaceholder.replace('{name}', copy.all)}
                  placeholderTextColor={theme.textTertiary}
                  selectionColor={theme.accentStrong}
                  autoCorrect={false}
                  autoCapitalize="none"
                  accessibilityLabel={copy.searchIn.replace('{name}', copy.all)}
                  style={[styles.drawerSearchInput, { color: theme.text }]}
                />
                {drawerQuery ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.close}
                    hitSlop={8}
                    onPress={() => setDrawerQuery('')}>
                    <Icon name="close" size={14} color={theme.textSecondary} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <ScrollView
              contentContainerStyle={[styles.drawerScroll, { paddingBottom: insets.bottom + 24 }]}
              showsVerticalScrollIndicator={false}>
              {editing ? (
                <>
                  <ThemedText variant="footnote" tone="textSecondary" style={styles.hint}>
                    {copy.customizeHint}
                  </ThemedText>

                  {section(
                    copy.browse,
                    customizeVisible.map((category) => customizeRow(category)),
                  )}

                  {customizeHidden.length > 0 ? (
                    <>
                      {section(
                        copy.hidden,
                        customizeHidden.map((category) => customizeRow(category)),
                      )}
                      <ThemedText variant="caption" tone="textTertiary" style={styles.hint}>
                        {copy.hiddenNote}
                      </ThemedText>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {section(
                    copy.browse,
                    filteredBrowse.map((category) => categoryDrawerRow(category)),
                  )}

                  {recentCategories.length > 0 ? (
                    <View style={styles.section}>
                      <ThemedText
                        variant="caption"
                        tone="textTertiary"
                        style={styles.sectionLabel}>
                        {copy.recent.toUpperCase()}
                      </ThemedText>
                      <View
                        style={[
                          styles.sectionBody,
                          { backgroundColor: theme.surface, borderColor: theme.border },
                        ]}>
                        {recentCategories.map((category) => (
                          <Pressable
                            key={`recent:${category.id}`}
                            accessibilityRole="button"
                            accessibilityLabel={labelFor(category)}
                            onPress={() => {
                              selectCategory(category);
                              closeDrawer();
                            }}
                            style={({ pressed }) => [
                              styles.drawerRow,
                              { borderBottomColor: theme.border },
                              pressed && styles.pressed,
                            ]}>
                            <Icon name="refresh" size={16} color={theme.textTertiary} />
                            <ThemedText variant="callout" style={styles.rowLabel}>
                              {labelFor(category)}
                            </ThemedText>
                            <Icon name="chevron" size={13} color={theme.textTertiary} />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {section(copy.shortcuts, config.shortcuts.map(shortcutDrawerRow))}

                  {config.features.contextual && contextualTabs.length > 0
                    ? section(copy.forYou, contextualTabs.map(contextualDrawerRow))
                    : null}
                </>
              )}
            </ScrollView>

            <View style={styles.footer}>
              {offline ? (
                <View
                  style={styles.offlineNote}
                  accessibilityLiveRegion="polite"
                  accessible>
                  <Icon name="info" size={14} color={theme.accentStrong} />
                  <ThemedText variant="caption" tone="textSecondary" style={styles.rowLabel}>
                    {copy.offlineChip} · {copy.offlineNote}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    zIndex: 5,
  },
  bar: {
    width: '100%',
  },
  barInner: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
  },
  allButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: TouchTarget,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    opacity: 0.35,
    marginHorizontal: Spacing.one,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingRight: Spacing.two,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 34,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.pill,
  },
  tabLabel: {
    fontWeight: '600',
    letterSpacing: 0,
  },
  contextual: {
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  quickSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 30,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 0,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0,
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.65,
  },
  panel: {
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    paddingVertical: Spacing.three,
    paddingHorizontal: ScreenPadding,
  },
  panelInner: {
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.two,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 42,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  panelInput: {
    flex: 1,
    minHeight: 40,
    fontSize: 15,
    paddingVertical: 0,
  },
  panelSearchAction: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: Spacing.one,
  },
  childWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    alignItems: 'center',
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 34,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  viewAll: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  modalRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    maxWidth: '92%',
    borderRightWidth: StyleSheet.hairlineWidth * 2,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  drawerHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  iconButton: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.small,
  },
  drawerScroll: {
    paddingBottom: Spacing.four,
  },
  drawerSearchWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  drawerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  drawerSearchInput: {
    flex: 1,
    minHeight: 36,
    fontSize: 15,
    paddingVertical: 0,
  },
  section: {
    marginTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
  sectionLabel: {
    marginLeft: Spacing.one,
  },
  sectionBody: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
  },
  drawerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 46,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 46,
  },
  rowLabel: {
    flex: 1,
  },
  drawerChild: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
    paddingLeft: Spacing.five,
    paddingRight: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hint: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  offlineNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 32,
  },
});
