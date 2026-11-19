-- Kiptrack: buyers may cancel their own order before it ships.
--
-- `orders` only had an update policy for sellers, so cancelling from the app
-- would have been rejected by RLS. This grants the narrow case: the buyer's own
-- order, still placed or confirmed, moved to cancelled. Shipping is final for
-- the buyer; after that only the seller can change the order.

create policy "buyers cancel their own orders"
  on public.orders for update
  using (
    auth.uid() = buyer_id
    and status in ('placed', 'confirmed')
  )
  with check (
    auth.uid() = buyer_id
    and status = 'cancelled'
  );
