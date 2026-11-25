import { supabase } from '@/lib/supabase';

export type OrderStatus = 'placed' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** The order steps shown as a timeline, in the order they happen. */
export const ORDER_STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: 'placed', label: 'Order placed', hint: 'We received your order.' },
  { status: 'confirmed', label: 'Confirmed', hint: 'The seller accepted the order.' },
  { status: 'shipped', label: 'Shipped', hint: 'On its way to you.' },
  { status: 'delivered', label: 'Delivered', hint: 'Handed over to the buyer.' },
];

export type OrderAddress = {
  name: string;
  phone: string;
  city: string;
  notes?: string;
};

export type OrderItemInput = {
  product: string;
  sku: string;
  title: string;
  priceMinor: number;
  qty: number;
  image?: string;
};

export type OrderItem = OrderItemInput & { id: string };

export type PaymentMethod = 'cash_on_delivery' | 'mtn_momo' | 'orange_money' | 'card';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export type Order = {
  id: string;
  reference: string;
  status: OrderStatus;
  createdAt: string;
  subtotalMinor: number;
  address: OrderAddress;
  items: OrderItem[];
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paymentRef: string | null;
};

/** A seller sees the part of an order that belongs to them. */
export type SellerOrder = Order & { sellerTotalMinor: number };

const ORDER_SELECT = [
  'id',
  'reference',
  'status',
  'subtotal_minor',
  'created_at',
  'delivery_name',
  'delivery_phone',
  'delivery_city',
  'delivery_notes',
  'payment_method',
  'payment_status',
  'payment_ref',
  'order_items(id,product_id,title,sku,price_minor,qty,image)',
].join(',');

type OrderItemRow = {
  id: string;
  product_id: string | null;
  title: string;
  sku: string | null;
  price_minor: number;
  qty: number;
  image: string | null;
};

type OrderRow = {
  id: string;
  reference: string;
  status: string;
  subtotal_minor: number;
  created_at: string;
  delivery_name: string;
  delivery_phone: string;
  delivery_city: string;
  delivery_notes: string | null;
  payment_method: string | null;
  payment_status: string | null;
  payment_ref: string | null;
  order_items: OrderItemRow[] | null;
};

type SellerOrderRow = {
  id: string;
  product_id: string | null;
  title: string;
  sku: string | null;
  price_minor: number;
  qty: number;
  image: string | null;
  orders: {
    id: string;
    reference: string;
    status: string;
    subtotal_minor: number;
    created_at: string;
    delivery_name: string;
    delivery_phone: string;
    delivery_city: string;
    delivery_notes: string | null;
    payment_method: string | null;
    payment_status: string | null;
    payment_ref: string | null;
  } | null;
};

function mapItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    product: row.product_id ?? '',
    sku: row.sku ?? '',
    title: row.title,
    priceMinor: row.price_minor,
    qty: row.qty,
    image: row.image ?? undefined,
  };
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status as OrderStatus,
    createdAt: row.created_at,
    subtotalMinor: row.subtotal_minor,
    address: {
      name: row.delivery_name,
      phone: row.delivery_phone,
      city: row.delivery_city,
      notes: row.delivery_notes ?? undefined,
    },
    items: (row.order_items ?? []).map(mapItem),
    paymentMethod: (row.payment_method as PaymentMethod) ?? null,
    paymentStatus: (row.payment_status as PaymentStatus) ?? 'pending',
    paymentRef: row.payment_ref,
  };
}

/**
 * Records an order and its lines. Stock is checked before the order is written,
 * so a buyer cannot buy more than a seller has.
 */
export async function placeOrder(
  items: OrderItemInput[],
  address: OrderAddress,
  paymentMethod: PaymentMethod = 'cash_on_delivery',
): Promise<Order> {
  if (items.length === 0) throw new Error('Your cart is empty.');

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const buyerId = userData.user?.id;
  if (!buyerId) throw new Error('Sign in to place an order.');

  const productIds = [...new Set(items.map((item) => item.product))];
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id,seller_id,title,stock_qty')
    .in('id', productIds);
  if (productsError) throw productsError;

  const byId = new Map(
    (products ?? []).map((row) => [
      row.id as string,
      { sellerId: row.seller_id as string, title: row.title as string, stockQty: row.stock_qty as number },
    ]),
  );

  for (const item of items) {
    const product = byId.get(item.product);
    if (!product) throw new Error(`${item.title} is no longer available.`);
    if (product.stockQty < item.qty) {
      throw new Error(`Only ${product.stockQty} of ${product.title} left in stock.`);
    }
  }

  const subtotalMinor = items.reduce((sum, item) => sum + item.priceMinor * item.qty, 0);
  const reference = `KIP-${Date.now().toString(36).toUpperCase()}`;

  const { data: orderRow, error: orderError } = await supabase
    .from('orders')
    .insert({
      buyer_id: buyerId,
      reference,
      subtotal_minor: subtotalMinor,
      delivery_name: address.name,
      delivery_phone: address.phone,
      delivery_city: address.city,
      delivery_notes: address.notes ?? null,
      payment_method: paymentMethod,
      payment_status: 'pending',
    })
    .select(
      'id,reference,status,subtotal_minor,created_at,delivery_name,delivery_phone,delivery_city,delivery_notes,payment_method,payment_status,payment_ref',
    )
    .single();
  if (orderError) throw orderError;

  const { data: insertedItems, error: itemsError } = await supabase
    .from('order_items')
    .insert(
      items.map((item) => ({
        order_id: orderRow.id,
        product_id: item.product,
        seller_id: byId.get(item.product)!.sellerId,
        title: item.title,
        sku: item.sku,
        price_minor: item.priceMinor,
        qty: item.qty,
        image: item.image ?? null,
      })),
    )
    .select('id,product_id,title,sku,price_minor,qty,image');
  if (itemsError) throw itemsError;

  // Best effort: the order is already recorded, so a failed decrement must not
  // pretend the purchase did not happen.
  await Promise.all(
    items.map((item) => {
      const product = byId.get(item.product)!;
      return supabase
        .from('products')
        .update({ stock_qty: Math.max(0, product.stockQty - item.qty) })
        .eq('id', item.product);
    }),
  );

  return {
    id: orderRow.id,
    reference: orderRow.reference,
    status: orderRow.status as OrderStatus,
    createdAt: orderRow.created_at,
    subtotalMinor: orderRow.subtotal_minor,
    address: {
      name: orderRow.delivery_name,
      phone: orderRow.delivery_phone,
      city: orderRow.delivery_city,
      notes: orderRow.delivery_notes ?? undefined,
    },
    items: ((insertedItems ?? []) as OrderItemRow[]).map(mapItem),
    paymentMethod: (orderRow.payment_method as PaymentMethod) ?? null,
    paymentStatus: (orderRow.payment_status as PaymentStatus) ?? 'pending',
    paymentRef: orderRow.payment_ref ?? null,
  };
}

export async function fetchBuyerOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as OrderRow[]).map(mapOrder);
}

export async function fetchBuyerOrder(id: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapOrder(data as unknown as OrderRow) : null;
}

/** Orders that contain at least one item sold by the signed-in seller. */
export async function fetchSellerOrders(): Promise<SellerOrder[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select(
      'id,product_id,title,sku,price_minor,qty,image,orders(id,reference,status,subtotal_minor,created_at,delivery_name,delivery_phone,delivery_city,delivery_notes)',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;

  const grouped = new Map<string, SellerOrder>();

  for (const row of (data ?? []) as unknown as SellerOrderRow[]) {
    const order = row.orders;
    if (!order) continue;

    const item = mapItem(row);
    const existing = grouped.get(order.id);

    if (existing) {
      existing.items.push(item);
      existing.sellerTotalMinor += item.priceMinor * item.qty;
      continue;
    }

    grouped.set(order.id, {
      id: order.id,
      reference: order.reference,
      status: order.status as OrderStatus,
      createdAt: order.created_at,
      subtotalMinor: order.subtotal_minor,
      address: {
        name: order.delivery_name,
        phone: order.delivery_phone,
        city: order.delivery_city,
        notes: order.delivery_notes ?? undefined,
      },
      items: [item],
      sellerTotalMinor: item.priceMinor * item.qty,
      paymentMethod: (order.payment_method as PaymentMethod) ?? null,
      paymentStatus: (order.payment_status as PaymentStatus) ?? 'pending',
      paymentRef: order.payment_ref,
    });
  }

  return [...grouped.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Cancels a buyer's own order while it is still placed or confirmed, and puts
 * the units back on sale. RLS is what actually enforces who may do this.
 */
export async function cancelOrder(orderId: string): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const buyerId = userData.user?.id;
  if (!buyerId) throw new Error('Sign in to cancel an order.');

  const { data: order, error: fetchError } = await supabase
    .from('orders')
    .select('id,buyer_id,status,order_items(product_id,qty)')
    .eq('id', orderId)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!order) throw new Error('Order not found.');
  if (order.buyer_id !== buyerId) throw new Error('You can only cancel your own orders.');
  if (order.status !== 'placed' && order.status !== 'confirmed') {
    throw new Error('This order can no longer be cancelled. Get in touch with the seller.');
  }

  const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
  if (error) throw error;

  // The cancellation already stands, so a failed restock must not be reported
  // to the buyer as a failed cancellation.
  const items = (order.order_items ?? []) as { product_id: string | null; qty: number }[];
  await Promise.all(
    items.map(async (item) => {
      if (!item.product_id) return;
      const { data: product } = await supabase
        .from('products')
        .select('stock_qty')
        .eq('id', item.product_id)
        .maybeSingle();
      if (!product) return;
      await supabase
        .from('products')
        .update({ stock_qty: (product.stock_qty as number) + item.qty })
        .eq('id', item.product_id);
    }),
  );
}

/** Moves an order along; RLS only lets a seller update orders they sell in. */
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
  const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
  if (error) throw error;
}
