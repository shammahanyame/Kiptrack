-- Kiptrack: real orders and product reviews.
--
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- It assumes the existing `public.products` and `public.categories` tables.

create type public.order_status as enum ('placed', 'confirmed', 'shipped', 'delivered', 'cancelled');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  reference text not null unique,
  status public.order_status not null default 'placed',
  subtotal_minor integer not null check (subtotal_minor >= 0),
  delivery_name text not null,
  delivery_phone text not null,
  delivery_city text not null,
  delivery_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  seller_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  sku text,
  price_minor integer not null check (price_minor >= 0),
  qty integer not null check (qty > 0),
  image text,
  created_at timestamptz not null default now()
);

create index orders_buyer_id_idx on public.orders (buyer_id);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_seller_id_idx on public.order_items (seller_id);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  buyer_name text not null default 'Kiptrack buyer',
  rating integer not null check (rating between 1 and 5),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id)
);

create index reviews_product_id_idx on public.reviews (product_id, created_at desc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reviews enable row level security;

-- A seller may read/update an order that contains one of their items. The
-- check lives in a SECURITY DEFINER function so the orders and order_items
-- policies cannot recurse into each other.
create or replace function public.is_order_seller(target_order uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.order_items
    where order_id = target_order and seller_id = auth.uid()
  );
$$;

create policy "buyers read their orders"
  on public.orders for select
  using (auth.uid() = buyer_id);

create policy "sellers read orders containing their items"
  on public.orders for select
  using (public.is_order_seller(id));

create policy "buyers create their orders"
  on public.orders for insert
  with check (auth.uid() = buyer_id);

create policy "sellers update their orders"
  on public.orders for update
  using (public.is_order_seller(id))
  with check (public.is_order_seller(id));

create policy "buyers read their order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.buyer_id = auth.uid()
    )
  );

create policy "sellers read their order items"
  on public.order_items for select
  using (seller_id = auth.uid());

create policy "buyers create their order items"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.buyer_id = auth.uid()
    )
  );

create policy "reviews are public"
  on public.reviews for select
  using (true);

create policy "buyers write their review"
  on public.reviews for insert
  with check (auth.uid() = buyer_id);

create policy "buyers edit their review"
  on public.reviews for update
  using (auth.uid() = buyer_id)
  with check (auth.uid() = buyer_id);

create policy "buyers delete their review"
  on public.reviews for delete
  using (auth.uid() = buyer_id);

grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select on public.reviews to anon, authenticated;
grant insert, update, delete on public.reviews to authenticated;
