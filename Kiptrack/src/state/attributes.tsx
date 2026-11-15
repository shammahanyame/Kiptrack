import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'kiptrack.attributes.v1';

export type ProductAttribute = {
  id: string;
  name: string;
  value: string;
};

export type VariationOption = {
  id: string;
  label: string;
  value: string;
};

export type Variation = {
  id: string;
  name: string;
  options: VariationOption[];
  selectedOptionId: string;
};

export type AttributesState = {
  attributes: ProductAttribute[];
  variations: Variation[];
  selectedVariationId: string | null;
  // persisted fields for the feature layer
  addAttribute: (name: string, value: string) => void;
  updateAttribute: (id: string, value: string) => void;
  addVariation: (name: string, options: string[]) => void;
  setSelectedVariationId: (id: string | null) => void;
  clear: () => void;
  ready: boolean;
};

const AttributesContext = createContext<AttributesState>({
  attributes: [],
  variations: [],
  selectedVariationId: null,
  addAttribute: () => {},
  updateAttribute: () => {},
  addVariation: () => {},
  setSelectedVariationId: () => {},
  clear: () => {},
  ready: false,
});

export function AttributesProvider({ children }: PropsWithChildren) {
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [selectedVariationId, setSelectedVariationIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const p = parsed as {
            attributes?: Array<Record<string, unknown>>;
            variations?: Array<Record<string, unknown>>;
            selectedVariationId?: string | null;
          };
          if (p.attributes?.length) {
            setAttributes(
              p.attributes.filter(
                (value): value is ProductAttribute =>
                  typeof value === 'object' &&
                  value !== null &&
                  'id' in value &&
                  typeof (value as ProductAttribute).id === 'string' &&
                  'name' in value &&
                  typeof (value as ProductAttribute).name === 'string' &&
                  'value' in value &&
                  typeof (value as ProductAttribute).value === 'string',
              ) as ProductAttribute[],
            );
          }
          if (p.variations?.length) {
            setVariations(
              p.variations.filter(
                (value): value is Variation =>
                  typeof value === 'object' &&
                  value !== null &&
                  'id' in value &&
                  typeof (value as Variation).id === 'string' &&
                  'name' in value &&
                  typeof (value as Variation).name === 'string' &&
                  'options' in value &&
                  Array.isArray((value as Variation).options) &&
                  'selectedOptionId' in value &&
                  typeof (value as Variation).selectedOptionId === 'string',
              ) as Variation[],
            );
          }
          if (p.selectedVariationId) {
            setSelectedVariationIdState(p.selectedVariationId as string | null);
          }
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
    (next: { attributes?: ProductAttribute[]; variations?: Variation[]; selectedVariationId?: string | null }) => {
      setAttributes(next.attributes ?? attributes);
      setVariations(next.variations ?? variations);
      if (next.selectedVariationId !== undefined) {
        setSelectedVariationIdState(next.selectedVariationId);
      }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    },
    [attributes, variations],
  );

  const addAttribute = useCallback(
    (name: string, value: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setAttributes((current) => [
        ...current,
        { id: `${name}-${value}-${Date.now()}`, name, value },
      ]);
      persist({ attributes: [...attributes, { id: `${name}-${value}-${Date.now()}`, name, value }] });
    },
    [attributes, persist],
  );

  const updateAttribute = useCallback(
    (id: string, value: string) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setAttributes((current) =>
        current.map((item) => (item.id === id ? { ...item, value } : item)),
      );
      persist({ attributes: attributes.map((item) => (item.id === id ? { ...item, value } : item)) });
    },
    [attributes, persist],
  );

  const addVariation = useCallback(
    (name: string, options: string[]) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      const variation: Variation = {
        id: `${name}-${Date.now()}`,
        name,
        options: options.map((option, i) => ({ id: `${option}-${i}`, label: option, value: option })),
        selectedOptionId: options[0] ?? '',
      };
      setVariations((current) => [...current, variation]);
      persist({ variations: [...variations, variation] });
    },
    [variations, persist],
  );

  const setSelectedVariationId = useCallback(
    (id: string | null) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      setSelectedVariationIdState(id);
      persist({ selectedVariationId: id });
    },
    [persist],
  );

  const clear = useCallback(() => {
    persist({ attributes: [], variations: [], selectedVariationId: null });
  }, [persist]);

  const value = useMemo<AttributesState>(
    () => ({
      attributes,
      variations,
      selectedVariationId,
      addAttribute,
      updateAttribute,
      addVariation,
      setSelectedVariationId,
      clear,
      ready,
    }),
    [attributes, variations, selectedVariationId, addAttribute, updateAttribute, addVariation, setSelectedVariationId, clear, ready],
  );

  return <AttributesContext.Provider value={value}>{children}</AttributesContext.Provider>;
}

export function useAttributes() {
  return useContext(AttributesContext);
}
