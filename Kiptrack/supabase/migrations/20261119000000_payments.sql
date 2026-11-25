-- Kiptrack: payment tracking for Mobile Money / card checkout.
-- Run once in the Supabase SQL editor after the orders migration.

alter table public.orders
  add column if not exists payment_method text,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_ref text;

create index if not exists orders_payment_status_idx on public.orders (payment_status);
