import { supabase } from '@/lib/supabase';
import type { PaymentMethod } from '@/lib/orders';

export type PaymentInitResult = {
  /** Provider reference stored on the order. */
  reference: string | null;
  /** URL the buyer should open to complete payment (if any). */
  checkoutUrl: string | null;
  /** Whether the provider is configured and a real payment was initiated. */
  live: boolean;
};

const CAMPAY_BASE = 'https://campay.net/api';

function campayHeaders(): Record<string, string> | null {
  const token = process.env.EXPO_PUBLIC_CAMPAY_TOKEN;
  if (!token) return null;
  return { Authorization: `Token ${token}`, 'Content-Type': 'application/json' };
}

/**
 * Initiates a Mobile Money payment for an order. When no provider is configured
 * (no EXPO_PUBLIC_CAMPAY_TOKEN) this returns a non-live result so the app can
 * fall back to a manual "cash on delivery / pay on delivery" flow instead of
 * crashing.
 */
export async function initiateMobileMoneyPayment(input: {
  orderId: string;
  amountMinor: number;
  phone: string;
  description: string;
}): Promise<PaymentInitResult> {
  const headers = campayHeaders();
  if (!headers) {
    return { reference: null, checkoutUrl: null, live: false };
  }

  try {
    const response = await fetch(`${CAMPAY_BASE}/collect/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: String(input.amountMinor),
        currency: 'XAF',
        from: input.phone.replace(/\D/g, ''),
        description: input.description.slice(0, 80),
        external_reference: input.orderId,
      }),
    });

    if (!response.ok) {
      return { reference: null, checkoutUrl: null, live: false };
    }

    const data = (await response.json()) as { reference?: string; ussd_code?: string };
    const reference = data.reference ?? null;

    if (reference) {
      await supabase
        .from('orders')
        .update({ payment_ref: reference, payment_status: 'pending' })
        .eq('id', input.orderId);
    }

    return { reference, checkoutUrl: null, live: true };
  } catch {
    return { reference: null, checkoutUrl: null, live: false };
  }
}

export function paymentMethodLabel(method: PaymentMethod | null): string {
  switch (method) {
    case 'mtn_momo':
      return 'MTN Mobile Money';
    case 'orange_money':
      return 'Orange Money';
    case 'card':
      return 'Card';
    case 'cash_on_delivery':
    default:
      return 'Cash on delivery';
  }
}
