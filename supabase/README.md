# kiptrack — Supabase backend (Phase 1)

Multi-vendor marketplace backend on Supabase (Postgres 15 + Auth + Storage + RLS + Edge Functions).

## Conventions

- **Money is integer minor units everywhere.** XAF has no subunit, so `1` = 1 XAF. The `_minor` suffix is mandatory on every money column so the convention is visible when a cents currency is added later. Never `numeric`/`decimal`/`float` for money.
- **Cost is private.** `product_costs` and `inventory_batches` are owned by the seller; RLS blocks everyone else. No public view, RPC, or Edge Function may `JOIN` these tables outside an owner-authenticated context. The app must never request cost columns in a public query.
- **Profit is computed server-side.** `order_items.profit_minor` is NOT a stored column; it is computed by `seller_order_item_report()` and by the `seller_daily_profit` roll-up. Storing it would allow drift between the snapshot and the display.
- **Every table has RLS.** No `PUBLIC` read on anything that isn't intentionally public (categories, active products).

## Apply the schema

```bash
# From the Supabase dashboard, upload these under Database > Migrations,
# or apply locally with psql:
psql -h <host> -U postgres -d <db> -f supabase/migrations/001_initial_schema.sql
psql -h <host> -U postgres -d <db> -f supabase/migrations/002_functions_and_triggers.sql
psql -h <host> -U postgres -d <db> -f supabase/migrations/003_product_image_storage.sql
```

Order matters: `001` creates tables and policies; `002` creates functions and re-attaches triggers (it drops and re-creates `refresh_seller_daily_profit` to fix a language typo in `001`'s trigger reference); `003` creates the public product-photo bucket and seller-scoped upload policies.

## Seed data

```bash
psql -h <host> -U postgres -d <db> -f supabase/seed/seed_data.sql
```

Seed creates four users (seller_a, seller_b, buyer, admin), five categories in EN + FR, two products for seller_a (dress, wall hanging) and one for seller_b (sandals), inventory batches at different costs, one completed order with a cost snapshot, budgets, wishlist, reviews, and the ledger account scaffolding.

The seed uses fixed UUIDs so the RLS test script can reference them. Replace the `\set` values in `test_cost_privacy.sql` if you re-seed with random UUIDs.

## Run the RLS privacy tests

```bash
psql -h <host> -U postgres -d <db> -f supabase/rlc_tests/test_cost_privacy.sql
```

The script uses `SET LOCAL auth.uid = <uuid>` to simulate a buyer, seller_b, and seller_a, and asserts that:

1. Buyer sees zero rows in `product_costs` for seller_a's product.
2. Buyer sees zero rows in `inventory_batches` for seller_a's product.
3. seller_b sees zero rows in `product_costs` for seller_a's product.
4. seller_b sees zero rows in `inventory_batches` for seller_a's product.
5. seller_a CAN read own costs/batches.
6. `public_product_catalog` view exposes no cost column.
7. Budget check allows a within-budget cart.
8. The seed order's cost snapshot equals the weighted average (17,929 XAF).
9. The `seller_daily_profit` roll-up matches expected profit.

If any `ASSERT` fails, the script raises and the test is FAILED. Run as a superuser (the `postgres` role) because `SET LOCAL auth.uid` requires permission to set that GUC, and the `SECURITY DEFINER` functions need to be callable.

## Supabase Auth → profiles

A trigger `create_profile_on_auth` on `auth.users` inserts a `profiles` row when a user signs up. The trigger runs as a SECURITY DEFINER function, so it can insert even though the `profiles` INSERT policy is `WITH CHECK (false)` for clients.

When you create users through the Supabase client (the normal path), the trigger fires automatically. The seed inserts directly into `auth.users` for determinism.

After sign-up, the mobile app should call a profile-update RPC or write to `profiles` directly (owner policy allows it) to set `full_name`, `phone`, `role`, etc.

## RLS matrix (phase 1)

| Table / View | Public read | Owner read | Owner write | Admin |
|---|---|---|---|---|
| profiles | no | own | own (except role) | yes |
| categories | yes | — | admin only | admin |
| category_translations | yes | — | admin only | admin |
| products | active only | own all | own | — |
| product_costs | **no** | own | own | — |
| inventory_batches | **no** | own | own | — |
| order_items | **no (all direct reads blocked)** | via views only | no (via functions) | yes |
| buyer_order_items_view | no | buyer own (no cost col) | — | — |
| seller_order_items_view | no | seller own (with cost col) | — | — |
| orders | no | buyer own / seller own sales | buyer own | — |
| addresses | no | own | own | — |
| cart_items | no | own | own | — |
| budget_settings | no | own | own | — |
| buyer_spending | no | own | (trigger) | — |
| wishlist_items | no | own | own | — |
| reviews | published | own / seller own | own | — |
| disputes | no | buyer/seller own | (admin) | admin |
| reports | no | reporter own | (admin) | admin |
| chat_messages | no | participants | sender | — |
| notifications | no | own | own | — |
| accounts | no | — | admin | admin |
| ledger_entries | no | own accounts | — | admin |
| payouts | no | seller own | admin | admin |
| audit_log | no | — | — | admin |
| product_alerts | no | own | own | — |
| seller_daily_profit | no | own | (trigger) | — |

## Cost privacy architecture (how we guarantee cost is never leaked)

Cost is enforced at THREE layers, not just one:

### Layer 1 — RLS on `order_items` blocks ALL direct reads

There is no `SELECT` policy for buyers or sellers on the underlying `order_items` table. `SELECT * FROM order_items` returns 0 rows for everyone except admin. This is the backend safety net: even if a view is dropped or a bug exposes the table, direct reads are blocked.

### Layer 2 — `buyer_order_items_view` (no cost column)

The buyer-facing view selects only safe columns: `id, order_id, product_id, seller_id, buyer_id, qty, sale_unit_price_minor, platform_fee_minor, shipping_minor, discount_minor, currency_minor, created_at, updated_at`. It does NOT include `cost_unit_price_snapshot_minor`. RLS on the view allows `auth.uid() = buyer_id`.

The mobile app queries this view for the buyer's order history. The view physically cannot return a cost column.

### Layer 3 — `seller_order_items_view` + `seller_order_item_report()` (cost included, owner-only)

The seller view includes the cost column, with RLS filtering to the requesting seller's own sales via a correlated subquery. The `seller_order_item_report()` RPC is `SECURITY DEFINER` and checks `auth.uid() = p_seller_id` before returning any rows — even though the function bypasses RLS (it runs as postgres), it enforces ownership internally.

### Why `SECURITY DEFINER` functions can read cost

In Postgres, `SECURITY DEFINER` functions run with the privileges of the function owner (typically `postgres` in Supabase, a superuser). Superusers **bypass RLS** by default. So `create_order()` and `seller_order_item_report()` can read/write `order_items.cost_unit_price_snapshot_minor` regardless of the table's RLS.

This is intentional: these functions are the ONLY way to access the cost column programmatically, and they validate ownership internally. The risk is that a malicious `SECURITY DEFINER` function could leak data — but our functions check ownership before returning cost data.

### Column-level privilege alternative (not used)

We considered `REVOKE SELECT ON order_items.cost_unit_price_snapshot_minor FROM authenticated`. This blocks the cost column even for `SELECT *` queries. We chose the view approach instead because views are more explicit and auditable (you can SEE which columns are exposed), and column privileges can be accidentally granted back by a future migration.

### Summary of what each role can see

| Role | product_costs | inventory_batches | order_items.cost_unit_price_snapshot_minor | seller_order_item_report |
|---|---|---|---|---|
| Buyer | ❌ 0 rows | ❌ 0 rows | ❌ via buyer view (no cost col) | ❌ raises (not owner) |
| Seller (own products) | ✅ own rows | ✅ own rows | ✅ via seller view + RPC | ✅ own report |
| Seller (other's products) | ❌ 0 rows | ❌ 0 rows | ❌ 0 rows via seller view | ❌ raises (not owner) |
| Admin | ✅ full | ✅ full | ✅ via direct table read | ✅ (admin role) |
| Anon | ❌ 0 rows | ❌ 0 rows | ❌ (no auth) | ❌ raises |

## Cost basis computation

Two methods, selectable per product (`cost_basis` column):

- **weighted_average (default):** `sum(qty * unit_cost_minor) / sum(qty)` across all batches for the product. Rounded to integer minor units. This is what `get_current_cost_for_product()` returns for the snapshot at sale time.
- **fifo:** cost of the earliest-acquired remaining batch. Correctly implementing FIFO under concurrent sales requires reserving batch quantities at order time; that's Phase 5 work. For MVP, FIFO returns the earliest batch's unit cost, and we accept that under heavy concurrency the FIFO cost may be slightly stale until the next restock. Flagged as a known tradeoff.

The weighted-average for the seed dress:
- batch A: 8 × 17,500 = 140,000
- batch B: 6 × 18,500 = 111,000
- total qty = 14, total cost = 251,000
- WA = 251,000 / 14 = 17,928.57 → round to **17,929**

## Profit formula (server-side)

```
profit_minor =
  (sale_unit_price_minor - cost_unit_price_snapshot_minor) * qty
  - platform_fee_minor
  - shipping_minor          -- seller-borne portion for this item
  - discount_minor
```

`margin_pct = profit_minor / (sale_unit_price_minor * qty) * 100`.

Computed in `seller_order_item_report()` and in the `seller_daily_profit` trigger. Never on the client.

## Order status machine

`placed → confirmed → shipped → delivered → completed`.
Side exits: `placed/confirmed/shipped → cancelled`, `delivered → refunded|disputed`.
Admin resolution from `disputed → resolved_refund | resolved_keep | escalated`.

Enforced by `enforce_order_status_transition()` on `orders.status`.

## Known tradeoffs and risks (be honest)

1. **FIFO under concurrency.** As noted, FIFO cost is stale under concurrent sales until the restock trigger re-evaluates. Weighted-average is cheaper to keep correct. If a seller needs true FIFO, we implement batch reservation in Phase 5.
2. **`seller_daily_profit` is a per-day roll-up, not a full history.** Custom date ranges (the dashboard's "custom range" requirement) are served by aggregating `seller_order_item_report()` directly. If that becomes slow, we add a monthly roll-up table. This is a Phase-5 optimization, not a Phase-1 blocker.
3. **`platform_fee_minor` is hardcoded at 5% in `create_order`.** The requirement says "platform commission configuration" — that belongs in a `platform_settings` table added in Phase 7. For Phase 1 we accept the hardcoded 5% and note the migration.
4. **`create_order` takes a JSONB payload.** This is the Edge Function / client contract. We'll wrap it in an Edge Function in Phase 4 (checkout). For now it's callable as a Postgres function; the mobile app will call it through the Supabase client's `rpc()` once Edge Functions are wired.
5. **Seed order's `platform_fee_minor` = 2,250** (5% of 45,000). The seed order total of 94,500 = subtotal 90,000 + fee 4,500 — wait, the seed sets fee at 4,500 for the order but each item's fee is 2,250 × 2 items = 4,500. Correct.
6. **`product_costs` has a composite FK `(product_id, seller_id)` referencing `products(id, seller_id)`.** This requires a matching unique constraint on `products(id, seller_id)` — which is implied by the PK on `products(id)` plus the `seller_id` column, but Postgres won't let a FK reference a non-unique set. We need `ALTER TABLE products ADD CONSTRAINT uq_products_id_seller UNIQUE (id, seller_id);` — I missed this in `001`. Add it before applying. I'll patch `001` in a follow-up edit.

## Ledger scaffolding

`accounts` + `ledger_entries` are created in Phase 1 so Phase 7 (escrow/payouts) doesn't reshape them. The account types are: `buyer`, `seller`, `platform_pending`, `platform_income`, `platform_expense`, `refund_contingency`, `wallet`, `system`. Entries are grouped by `transaction_ref`. No trigger maintains double-entry balance yet — that's Phase 7. For now the tables exist and are RLS-protected.

## What's next (Phase 2)

Phase 2 is Auth, roles, and profiles: phone/email OTP sign-up, role selection (buyer/seller/both), profile completion, seller verification flow scaffolding. The schema already has the columns; Phase 2 wires the Supabase Auth UI/Edge Functions and the profile-completion flow.
