import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OrderAddress } from '@/lib/orders';

const STORAGE_KEY = 'kiptrack.delivery.v1';

export type SavedDeliveryAddress = Pick<OrderAddress, 'name' | 'phone' | 'city'>;

/**
 * The delivery details used on the last order. Stored on this device only, the
 * same way a storefront remembers where you ship to. Notes are per-order and
 * deliberately not remembered.
 */
export async function loadDeliveryAddress(): Promise<Partial<SavedDeliveryAddress> | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const value = parsed as Record<string, unknown>;
    return {
      name: typeof value.name === 'string' ? value.name : undefined,
      phone: typeof value.phone === 'string' ? value.phone : undefined,
      city: typeof value.city === 'string' ? value.city : undefined,
    };
  } catch {
    // A corrupt record should never block checkout.
    return null;
  }
}

export async function saveDeliveryAddress(address: SavedDeliveryAddress): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ name: address.name, phone: address.phone, city: address.city }),
    );
  } catch {
    // Remembering the address is a convenience, not part of the order.
  }
}
