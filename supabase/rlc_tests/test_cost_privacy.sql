-- ============================================================
-- test_cost_privacy.sql  (v3 — runs against the live Supabase project)
-- Phase 1 — RLS privacy test suite.
-- Cost boundary is enforced three ways:
--   1. RLS on order_items blocks ALL direct reads (except admin).
--   2. buyer_order_items_view  exposes safe columns only (no cost),
--      with `WHERE buyer_id = auth.uid()` baked into the view.
--   3. seller_order_items_view exposes all columns, filtered by
--      `WHERE seller_id = auth.uid()`.
--   4. seller_order_item_report() checks auth.uid() = p_seller_id.
--
-- Impersonation: Supabase's auth.uid() reads the
-- `request.jwt.claim.sub` GUC, and we must run as a non-owner role
-- (`authenticated`) because table owners bypass RLS. ASSERT is a
-- PL/pgSQL statement, so every assertion lives in a DO block.
-- ============================================================

BEGIN;

-- ── Seed UUIDs (must match seed_data.sql) ────────────────────
\set seller_a_id 'a1111111-1111-1111-1111-111111111111'
\set seller_b_id 'b2222222-2222-2222-2222-222222222222'
\set buyer_id    'c3333333-3333-3333-3333-333333333333'
\set admin_id    'd4444444-4444-4444-4444-444444444444'

\set dress_product_id (SELECT id FROM products WHERE seller_id = :'seller_a_id' AND sku = 'WXDR-001' LIMIT 1)
\set sandals_product_id (SELECT id FROM products WHERE seller_id = :'seller_b_id' AND sku = 'SDLS-001' LIMIT 1)

-- Public catalog view (no cost columns). Created as owner, read by all.
CREATE OR REPLACE VIEW public_product_catalog AS
SELECT
  p.id, p.seller_id, p.title, p.description,
  p.selling_price_minor, p.currency_minor, p.stock_qty,
  p.low_stock_threshold, p.images, p.variants, p.barcode, p.sku,
  p.status, p.is_shipping_free, p.shipping_minor, p.featured,
  p.view_count, p.created_at, p.updated_at, p.published_at,
  c.name AS category_name
FROM products p
JOIN category_translations c ON c.category_id = p.category_id AND c.locale = 'en'
WHERE p.status = 'active';

GRANT SELECT ON public_product_catalog TO anon, authenticated;

\echo 'TEST 1 — Buyer cannot read seller_a product_costs'
SET LOCAL request.jwt.claim.sub = :'buyer_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM product_costs) = 0,
    'FAIL TEST 1: buyer leaked seller_a product_costs';
END $$;
RESET ROLE;

\echo 'TEST 2 — Buyer cannot read seller_a inventory_batches'
SET LOCAL request.jwt.claim.sub = :'buyer_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM inventory_batches) = 0,
    'FAIL TEST 2: buyer leaked seller_a inventory_batches';
END $$;
RESET ROLE;

\echo 'TEST 3 — seller_b cannot read seller_a product_costs'
SET LOCAL request.jwt.claim.sub = :'seller_b_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM product_costs WHERE product_id = :'dress_product_id') = 0,
    'FAIL TEST 3: seller_b leaked seller_a product_costs';
END $$;
RESET ROLE;

\echo 'TEST 4 — seller_b cannot read seller_a inventory_batches'
SET LOCAL request.jwt.claim.sub = :'seller_b_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM inventory_batches WHERE product_id = :'dress_product_id') = 0,
    'FAIL TEST 4: seller_b leaked seller_a inventory_batches';
END $$;
RESET ROLE;

\echo 'TEST 5 — seller_a CAN read own product_costs'
SET LOCAL request.jwt.claim.sub = :'seller_a_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM product_costs WHERE product_id = :'dress_product_id') > 0,
    'FAIL TEST 5: seller_a cannot read own product_costs';
END $$;
RESET ROLE;

\echo 'TEST 6 — seller_a CAN read own inventory_batches'
SET LOCAL request.jwt.claim.sub = :'seller_a_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM inventory_batches WHERE product_id = :'dress_product_id') > 0,
    'FAIL TEST 6: seller_a cannot read own inventory_batches';
END $$;
RESET ROLE;

\echo 'TEST 7 — public_product_catalog exposes NO cost column'
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_product_catalog'
      AND column_name LIKE '%cost%'
  ), 'FAIL TEST 7: public_product_catalog exposes a cost column';
END $$;

\echo 'TEST 8 — buyer CAN read own order items via the VIEW (no cost column)'
SET LOCAL request.jwt.claim.sub = :'buyer_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM buyer_order_items_view) > 0,
    'FAIL TEST 8a: buyer cannot see own order items via view';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buyer_order_items_view'
      AND column_name = 'cost_unit_price_snapshot_minor'
  ), 'FAIL TEST 8b: buyer_order_items_view leaks cost column';
END $$;

\echo 'TEST 9 — buyer CANNOT read order_items directly'
SET LOCAL request.jwt.claim.sub = :'buyer_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM order_items) = 0,
    'FAIL TEST 9: buyer can read order_items directly (RLS leak)';
END $$;
RESET ROLE;

\echo 'TEST 10 — seller CAN read own order items via seller view (WITH cost)'
SET LOCAL request.jwt.claim.sub = :'seller_a_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM seller_order_items_view) > 0,
    'FAIL TEST 10a: seller cannot see own order items via view';

  ASSERT (SELECT cost_unit_price_snapshot_minor
            FROM seller_order_items_view
           WHERE product_id = :'dress_product_id'
           LIMIT 1) = 17929,
    'FAIL TEST 10c: seller view cost snapshot mismatch (expected 17929)';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'seller_order_items_view'
      AND column_name = 'cost_unit_price_snapshot_minor'
  ), 'FAIL TEST 10b: seller_order_items_view missing cost column';
END $$;

\echo 'TEST 11 — seller_b CANNOT read seller_a order items via view'
SET LOCAL request.jwt.claim.sub = :'seller_b_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM seller_order_items_view) = 0,
    'FAIL TEST 11: seller_b leaked seller_a order items via view';
END $$;
RESET ROLE;

\echo 'TEST 12 — seller_order_item_report enforces ownership (raises)'
CREATE TEMP TABLE IF NOT EXISTS _test12_result (raised BOOLEAN);
TRUNCATE _test12_result;

-- The ownership guard inside the function is an explicit
-- `auth.uid() <> p_seller_id` RAISE, so this block can run as the
-- session owner (the temp table needs owner privileges).
SET LOCAL request.jwt.claim.sub = :'seller_b_id';
DO $$
BEGIN
  PERFORM seller_order_item_report(:'seller_a_id');
  INSERT INTO _test12_result VALUES (FALSE);
EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO _test12_result VALUES (TRUE);
END $$;

DO $$
BEGIN
  ASSERT (SELECT raised FROM _test12_result LIMIT 1) = TRUE,
    'FAIL TEST 12: seller_order_item_report did not reject seller_b calling for seller_a';
END $$;

DROP TABLE IF EXISTS _test12_result;

\echo 'TEST 13 — seller_order_item_report works for own seller (with cost)'
SET LOCAL request.jwt.claim.sub = :'seller_a_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM seller_order_item_report(:'seller_a_id')) > 0,
    'FAIL TEST 13: seller_a cannot call own report';

  ASSERT (SELECT cost_unit_price_snapshot_minor
            FROM seller_order_item_report(:'seller_a_id')
           WHERE product_id = :'dress_product_id'
           LIMIT 1) = 17929,
    'FAIL TEST 13b: seller_order_item_report cost column mismatch';
END $$;
RESET ROLE;

\echo 'TEST 14 — seller_b cannot see seller_a cost via seller view'
SET LOCAL request.jwt.claim.sub = :'seller_b_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM seller_order_items_view
           WHERE cost_unit_price_snapshot_minor IS NOT NULL) = 0,
    'FAIL TEST 14: seller_b can see seller_a cost via view';
END $$;
RESET ROLE;

\echo 'TEST 15 — check_buyer_budget allows within-budget cart'
SET LOCAL request.jwt.claim.sub = :'buyer_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT allowed FROM check_buyer_budget(:'buyer_id', 50000)) = TRUE,
    'FAIL TEST 15: budget check blocked a within-budget cart';
END $$;
RESET ROLE;

\echo 'TEST 16 — cost snapshot on seed order is correct (via view)'
SET LOCAL request.jwt.claim.sub = :'seller_a_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT cost_unit_price_snapshot_minor FROM seller_order_items_view
           WHERE product_id = :'dress_product_id'
           LIMIT 1) = 17929,
    'FAIL TEST 16: cost snapshot mismatch (expected 17929)';
END $$;
RESET ROLE;

\echo 'TEST 17 — seller_daily_profit roll-up matches expected'
SET LOCAL request.jwt.claim.sub = :'seller_a_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- Expected: (45000 - 17929) * 2 - 2250*2 = 54142 - 4500 = 49642
  ASSERT (SELECT profit_minor FROM seller_daily_profit
           WHERE seller_id = :'seller_a_id' AND day = CURRENT_DATE) = 49642,
    'FAIL TEST 17: seller_daily_profit roll-up mismatch (expected 49642)';
END $$;
RESET ROLE;

\echo 'TEST 18 — admin can read order_items directly (with cost)'
SET LOCAL request.jwt.claim.sub = :'admin_id';
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM order_items) > 0,
    'FAIL TEST 18: admin cannot read order_items';

  ASSERT EXISTS (
    SELECT 1 FROM order_items
    WHERE cost_unit_price_snapshot_minor IS NOT NULL
    LIMIT 1
  ), 'FAIL TEST 18b: admin order_items missing cost data';
END $$;
RESET ROLE;

\echo 'ALL TESTS PASSED'

COMMIT;
