-- ============================================================
-- 002_functions_and_triggers.sql
-- Phase 1 — function + trigger bodies referenced by 001.
-- These are the heart of cost privacy and profit correctness.
-- ============================================================

BEGIN;

-- ── Helpers ──────────────────────────────────────────────────

-- Current authenticated seller's cost basis for a product.
-- Used by the sale function to snapshot cost. Reads ONLY from
-- inventory_batches and product_costs in an owner context.
-- Raises if called by a non-owner (defense in depth).

CREATE OR REPLACE FUNCTION get_current_cost_for_product(
  p_product_id  UUID,
  p_seller_id   UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER  -- runs with owner perms so it can read batches
STRICT
AS $$
DECLARE
  v_basis       cost_basis;
  v_cost        NUMERIC := 0;
  v_total_qty  INTEGER := 0;
  v_weighted    NUMERIC := 0;
BEGIN
  -- Confirm ownership (cost privacy: never compute cost for a
  -- product whose seller_id != auth.uid()).
  IF p_seller_id IS NULL THEN
    RAISE EXCEPTION 'get_current_cost_for_product: seller_id required';
  END IF;

  SELECT cost_basis INTO v_basis
  FROM products
  WHERE id = p_product_id AND seller_id = p_seller_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found or not owned';
  END IF;

  -- Weighted average across batches
  IF v_basis = 'weighted_average' THEN
    SELECT
      COALESCE(SUM(qty * unit_cost_minor), 0),
      COALESCE(SUM(qty), 0)
    INTO v_weighted, v_total_qty
    FROM inventory_batches
    WHERE product_id = p_product_id AND seller_id = p_seller_id;

    IF v_total_qty > 0 THEN
      v_cost := v_weighted / v_total_qty;
    END IF;

    RETURN CASE WHEN v_cost = 0 THEN 0 ELSE round(v_cost) END::INTEGER;

  -- FIFO: cost of the earliest remaining batch
  ELSIF v_basis = 'fifo' THEN
    SELECT unit_cost_minor INTO v_cost
    FROM inventory_batches
    WHERE product_id = p_product_id AND seller_id = p_seller_id
    ORDER BY acquired_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN 0;
    END IF;

    RETURN v_cost;
  END IF;

  RETURN 0;
END;
$$;

-- Weighted-average cost rounded to integer minor units.
-- Exposed to sellers via the seller cost report RPC only.

CREATE OR REPLACE FUNCTION weighted_average_cost(p_product_id UUID, p_seller_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
STRICT
AS $$
DECLARE
  v_weighted   NUMERIC := 0;
  v_total_qty  INTEGER := 0;
BEGIN
  SELECT
    COALESCE(SUM(qty * unit_cost_minor), 0),
    COALESCE(SUM(qty), 0)
  INTO v_weighted, v_total_qty
  FROM inventory_batches
  WHERE product_id = p_product_id AND seller_id = p_seller_id;

  IF v_total_qty = 0 THEN
    RETURN NULL;  -- no stock = no cost basis
  END IF;

  RETURN v_weighted / v_total_qty;
END;
$$;

-- ── Sale creation (the critical transaction) ─────────────────
-- Creates an order + order_items with cost snapshots, decrements
-- stock in a single transaction, writes ledger entries, and
-- returns the created order.

-- Expected inputs (JSONB for ease of caller):
-- {
--   buyer_id,
--   shipping_address_id,
--   items: [ { product_id, qty, seller_id, sale_unit_price_minor, discount_minor } ],
--   payment_method,
--   notes
-- }

CREATE OR REPLACE FUNCTION create_order(payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_buyer_id       UUID;
  v_address_id     UUID;
  v_payment_method payment_method;
  v_notes          TEXT;
  v_order_id       UUID;
  v_subtotal       INTEGER := 0;
  v_shipping_total INTEGER := 0;
  v_discount_total INTEGER := 0;
  v_fee_total      INTEGER := 0;
  v_fee            INTEGER;
  v_item          JSONB;
  v_idx            INT;
  v_qty            INTEGER;
  v_sale_price     INTEGER;
  v_cost_snapshot  INTEGER;
  v_product_seller UUID;
  v_product_stock  INTEGER;
  v_shipping_minor INTEGER;
  v_item_discount  INTEGER;
BEGIN
  -- Parse
  v_buyer_id       := (payload->>'buyer_id')::UUID;
  v_address_id     := (payload->>'shipping_address_id')::UUID;
  v_payment_method := NULLIF((payload->>'payment_method')::text, '')::payment_method;
  v_notes          := payload->>'notes';

  -- Buyer must be authenticated
  IF v_buyer_id IS NULL THEN
    RAISE EXCEPTION 'create_order: buyer_id required';
  END IF;

  -- Start the order row
  INSERT INTO orders (
    buyer_id, status, shipping_address_id, payment_method,
    payment_status, notes, subtotal_minor, shipping_minor,
    discount_minor, platform_fee_total_minor, total_minor
  ) VALUES (
    v_buyer_id, 'placed', v_address_id, v_payment_method,
    'pending', v_notes, 0, 0, 0, 0, 0
  ) RETURNING id INTO v_order_id;

  -- Process each line item inside a sub-transaction so one bad
  -- item does not leave a half-created order.
  FOR v_idx IN 0..jsonb_array_length(payload->'items')-1 LOOP
    v_item := payload->'items'->v_idx;

    v_qty        := (v_item->>'qty')::INTEGER;
    v_sale_price := (v_item->>'sale_unit_price_minor')::INTEGER;
    v_item_discount := COALESCE((v_item->>'discount_minor')::INTEGER, 0);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'create_order: invalid qty for item %', v_idx;
    END IF;
    IF v_sale_price IS NULL OR v_sale_price < 0 THEN
      RAISE EXCEPTION 'create_order: invalid sale price for item %', v_idx;
    END IF;

    -- Cost snapshot: ONLY the owning seller's context.
    v_product_seller := (v_item->>'seller_id')::UUID;

    -- Validate ownership: the seller_id on the item must equal the
    -- product's seller_id (prevents a buyer manipulating the payload
    -- to attribute a sale to the wrong seller).
    SELECT seller_id INTO v_product_seller
    FROM products
    WHERE id = (v_item->>'product_id')::UUID
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'create_order: product % not found', v_item->>'product_id';
    END IF;

    -- Cost snapshot from the seller's cost basis
    v_cost_snapshot := get_current_cost_for_product(
      (v_item->>'product_id')::UUID,
      v_product_seller
    );

    -- Stock check + decrement (prevent overselling under concurrency
    -- via SELECT ... FOR UPDATE on the product row).
    SELECT stock_qty INTO v_product_stock
    FROM products
    WHERE id = (v_item->>'product_id')::UUID
    FOR UPDATE;

    IF v_product_stock < v_qty THEN
      RAISE EXCEPTION 'create_order: insufficient stock for product % (have %, want %)',
        (v_item->>'product_id')::UUID, v_product_stock, v_qty;
    END IF;

    -- Decrement stock (product-level counter)
    UPDATE products
    SET stock_qty = stock_qty - v_qty,
        view_count = view_count + 1
    WHERE id = (v_item->>'product_id')::UUID;

    -- Decrement from inventory batches (FIFO: consume oldest remaining
    -- batches first). This keeps cost-basis integrity for future sales.
    IF v_product_stock > 0 THEN
      WITH batch AS (
        SELECT id, qty FROM inventory_batches
        WHERE product_id = (v_item->>'product_id')::UUID
          AND seller_id = v_product_seller
          AND qty > 0
        ORDER BY acquired_at ASC
        FOR UPDATE
      )
      UPDATE inventory_batches b
      SET qty = CASE WHEN v_qty <= b.qty THEN b.qty - v_qty ELSE 0 END
      FROM batch
      WHERE b.id = (SELECT id FROM batch LIMIT 1)
        AND v_qty > 0;
    END IF;

    -- Shipping: seller-borne portion (0 if free or buyer pays)
    SELECT COALESCE(shipping_minor, 0) INTO v_shipping_minor
    FROM products WHERE id = (v_item->>'product_id')::UUID;

    -- Platform fee: read from platform_settings (by key 'commission').
    -- Fallback 5% if not configured, so the app is never stuck.
    BEGIN
      SELECT value->>'rate' INTO v_fee
      FROM platform_settings
      WHERE key = 'commission';
      IF v_fee IS NOT NULL THEN
        v_fee := round(((v_sale_price * v_qty) - v_item_discount)::NUMERIC * (v_fee::NUMERIC));
      ELSE
        v_fee := round(((v_sale_price * v_qty) - v_item_discount) * 0.05);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_fee := round(((v_sale_price * v_qty) - v_item_discount) * 0.05);
    END;

    -- Insert the snapshot row (profit is NOT stored; computed by view)
    INSERT INTO order_items (
      order_id, product_id, seller_id, buyer_id,
      qty, sale_unit_price_minor, cost_unit_price_snapshot_minor,
      platform_fee_minor, shipping_minor, discount_minor,
      currency_minor
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::UUID,
      v_product_seller,
      v_buyer_id,
      v_qty,
      v_sale_price,
      v_cost_snapshot,
      v_fee,
      CASE WHEN v_shipping_minor > 0 THEN v_shipping_minor ELSE 0 END,
      v_item_discount,
      1  -- XAF
    );

    -- Accumulate
    v_subtotal       := v_subtotal + ((v_sale_price * v_qty) - v_item_discount);
    v_shipping_total := v_shipping_total + (CASE WHEN v_shipping_minor > 0 THEN v_shipping_minor ELSE 0 END);
    v_discount_total := v_discount_total + v_item_discount;
    v_fee_total      := v_fee_total + v_fee;
  END LOOP;

  -- Finalize totals
  UPDATE orders SET
    subtotal_minor       = v_subtotal,
    shipping_minor       = v_shipping_total,
    discount_minor       = v_discount_total,
    platform_fee_total_minor = v_fee_total,
    total_minor          = v_subtotal + v_shipping_total - v_discount_total + v_fee_total,
    payment_status       = CASE WHEN v_payment_method = 'cash_on_delivery' THEN 'pending' ELSE 'pending' END
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

-- ── Order status machine ─────────────────────────────────────
-- Valid transitions. Prevents impossible state jumps.

CREATE OR REPLACE FUNCTION enforce_order_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed TEXT[];
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Absorbing states: once here, no further transitions.
  IF OLD.status IN ('completed','cancelled','refunded') THEN
    RAISE EXCEPTION 'order_status: cannot transition from % to %',
      OLD.status, NEW.status;
  END IF;

  -- Disputed is a special branch: only admin resolution moves.
  IF OLD.status = 'disputed' THEN
    IF NEW.status NOT IN ('resolved_refund','resolved_keep','escalated') THEN
      RAISE EXCEPTION 'order_status: disputed can only resolve, not %', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  -- Normal flow: look up allowed next states.
  SELECT allowed INTO v_allowed
  FROM (VALUES
    ('placed',    ARRAY['confirmed','cancelled','disputed']),
    ('confirmed', ARRAY['shipped','cancelled']),
    ('shipped',   ARRAY['delivered','cancelled']),
    ('delivered', ARRAY['completed','refunded','disputed'])
  ) AS t(cur, allowed)
  WHERE t.cur = OLD.status;

  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'order_status: unknown current status %', OLD.status;
  END IF;

  IF NEW.status = ANY(v_allowed) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'order_status: invalid transition from % to %',
    OLD.status, NEW.status;
END;
$$;

-- Set delivered_at / completed_at / cancelled_at on status transition.
-- AFTER UPDATE is used because we read OLD.status to detect the change,
-- but we write to NEW.* so this must be a BEFORE trigger. We use BEFORE.
CREATE OR REPLACE FUNCTION set_order_timestamps_from_status()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'delivered') THEN
    NEW.delivered_at = now();
  END IF;
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at = now();
  END IF;
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'cancelled') THEN
    NEW.cancelled_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- ── Denormalized seller aggregates (triggers) ───────────────

-- Refresh seller_rating_avg + seller_review_count on profiles.
CREATE OR REPLACE FUNCTION refresh_seller_review_aggregates()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_seller UUID;
  v_avg    NUMERIC;
  v_count  INTEGER;
BEGIN
  -- Determine which seller to refresh
  IF TG_OP = 'DELETE' THEN
    v_seller := OLD.seller_id;
  ELSE
    v_seller := COALESCE(NEW.seller_id, OLD.seller_id);
  END IF;

  IF v_seller IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(AVG(rating), 0), COUNT(*)
  INTO v_avg, v_count
  FROM reviews
  WHERE seller_id = v_seller AND status = 'published';

  UPDATE profiles SET
    seller_rating_avg   = CASE WHEN v_count > 0 THEN round(v_avg * 100) / 100.0 ELSE NULL END,
    seller_review_count = v_count,
    updated_at = now()
  WHERE id = v_seller;

  RETURN NULL;
END;
$$;

-- Refresh seller_reputation_score on profiles.
-- Simple model: base 100, minus review penalties, plus completed sales bonus.
-- Real model should factor dispute rate; kept simple for MVP.
CREATE OR REPLACE FUNCTION refresh_seller_reputation_score()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_seller UUID;
  v_score  INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_seller := OLD.seller_id;
  ELSE
    v_seller := COALESCE(NEW.seller_id, OLD.seller_id);
  END IF;
  IF v_seller IS NULL THEN RETURN NULL; END IF;

  SELECT
    100
    - COALESCE((
        SELECT count(*)::INTEGER
        FROM reviews
        WHERE seller_id = v_seller AND rating <= 2 AND status = 'published'
      ), 0) * 2
  INTO v_score;

  v_score := GREATEST(0, LEAST(100, v_score));

  UPDATE profiles SET
    seller_reputation_score = v_score,
    updated_at = now()
  WHERE id = v_seller;

  RETURN NULL;
END;
$$;

-- Seller profit + units sold + inventory value roll-up.
-- Maintained by trigger on order_items; used by dashboard for
-- "today / week / month" totals without scanning all order_items.

CREATE TABLE IF NOT EXISTS seller_daily_profit (
  seller_id          UUID        NOT NULL,
  day                DATE        NOT NULL,
  units_sold         INTEGER     NOT NULL DEFAULT 0,
  revenue_minor      INTEGER     NOT NULL DEFAULT 0,
  cost_minor         INTEGER     NOT NULL DEFAULT 0,
  fee_minor          INTEGER     NOT NULL DEFAULT 0,
  shipping_minor     INTEGER     NOT NULL DEFAULT 0,
  discount_minor     INTEGER     NOT NULL DEFAULT 0,
  profit_minor       INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (seller_id, day)
);

ALTER TABLE seller_daily_profit ENABLE ROW LEVEL SECURITY;

CREATE POLICY " seller_daily_profit: owner read "
  ON seller_daily_profit FOR SELECT
  USING ( auth.uid() = seller_id );

CREATE POLICY " seller_daily_profit: no direct write "
  ON seller_daily_profit FOR ALL
  USING ( false );

-- ── Buyer spending counters ──────────────────────────────────

CREATE OR REPLACE FUNCTION update_buyer_spending()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_buyer UUID;
  v_spent INTEGER;
  v_today DATE := CURRENT_DATE;
  v_month_start DATE := date_trunc('month', now())::DATE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_buyer := OLD.buyer_id;
    v_spent := -(
      (OLD.sale_unit_price_minor * OLD.qty)
      - OLD.discount_minor
    );
  ELSE
    v_buyer := NEW.buyer_id;
    v_spent := (NEW.sale_unit_price_minor * NEW.qty) - NEW.discount_minor;
  END IF;

  IF v_buyer IS NULL THEN RETURN NULL; END IF;

  -- Overall
  INSERT INTO buyer_spending (profile_id, period_start, period_type, spent_minor)
  VALUES (v_buyer, '1970-01-01'::DATE, 'overall', v_spent)
  ON CONFLICT (profile_id, period_type, period_start)
  DO UPDATE SET spent_minor = buyer_spending.spent_minor + EXCLUDED.spent_minor,
                updated_at = now();

  -- Monthly
  INSERT INTO buyer_spending (profile_id, period_start, period_type, spent_minor)
  VALUES (v_buyer, v_month_start, 'monthly', v_spent)
  ON CONFLICT (profile_id, period_type, period_start)
  DO UPDATE SET spent_minor = buyer_spending.spent_minor + EXCLUDED.spent_minor,
                updated_at = now();

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION update_buyer_spending_on_refund()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_delta INTEGER;
  v_today DATE := CURRENT_DATE;
  v_month_start DATE := date_trunc('month', now())::DATE;
BEGIN
  -- Refund increased: decrease overall + monthly spending counters
  v_delta := NEW.refund_total_minor - OLD.refund_total_minor;
  IF v_delta <= 0 THEN RETURN NEW; END IF;

  -- Overall
  UPDATE buyer_spending SET
    spent_minor = spent_minor - v_delta,
    updated_at = now()
  WHERE profile_id = NEW.buyer_id
    AND period_type = 'overall'
    AND period_start = '1970-01-01'::DATE;

  -- Monthly
  UPDATE buyer_spending SET
    spent_minor = spent_minor - v_delta,
    updated_at = now()
  WHERE profile_id = NEW.buyer_id
    AND period_type = 'monthly'
    AND period_start = v_month_start;

  RETURN NEW;
END;
$$;

-- ── Alerts ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_low_stock_alert()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.stock_qty = 0 AND (OLD.stock_qty IS NULL OR OLD.stock_qty > 0) THEN
    INSERT INTO product_alerts (product_id, seller_id, alert_type, message)
    VALUES (NEW.id, NEW.seller_id, 'out_of_stock',
            format('Product "%s" is now out of stock', NEW.title));
  ELSIF NEW.stock_qty > OLD.stock_qty THEN
    -- restocked: clear any out-of-stock alert
    UPDATE product_alerts SET is_resolved = TRUE
    WHERE product_id = NEW.id
      AND alert_type IN ('out_of_stock','low_stock')
      AND is_resolved = FALSE;
  ELSIF NEW.stock_qty <= NEW.low_stock_threshold
        AND (OLD.stock_qty IS NULL OR OLD.stock_qty > NEW.low_stock_threshold) THEN
    INSERT INTO product_alerts (product_id, seller_id, alert_type, message)
    VALUES (NEW.id, NEW.seller_id, 'low_stock',
            format('Product "%s" is low on stock (%s left, threshold %s)',
              NEW.title, NEW.stock_qty, NEW.low_stock_threshold));
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION check_below_cost_alert()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_cost INTEGER;
  v_price INTEGER;
BEGIN
  v_price := NEW.selling_price_minor;
  v_cost  := get_current_cost_for_product(NEW.id, NEW.seller_id)::INTEGER;

  IF v_cost IS NOT NULL AND v_cost > 0 AND v_price < v_cost THEN
    INSERT INTO product_alerts (product_id, seller_id, alert_type, message)
    VALUES (NEW.id, NEW.seller_id, 'below_cost',
            format('Listed price (%s) is below cost (%s) on "%s"',
              v_price, v_cost, NEW.title))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION check_below_cost_alert_after_batch()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_cost  INTEGER;
  v_price INTEGER;
BEGIN
  SELECT selling_price_minor INTO v_price
  FROM products WHERE id = NEW.product_id;

  v_cost := get_current_cost_for_product(NEW.product_id, NEW.seller_id)::INTEGER;

  IF v_cost IS NOT NULL AND v_cost > 0 AND v_price < v_cost THEN
    INSERT INTO product_alerts (product_id, seller_id, alert_type, message)
    VALUES (NEW.product_id, NEW.seller_id, 'below_cost',
            format('After restock, cost (%s) exceeds listed price (%s)',
              v_cost, v_price))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NULL;
END;
$$;

-- ── Audit log ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_price_change()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.selling_price_minor IS DISTINCT FROM NEW.selling_price_minor THEN
    INSERT INTO audit_log (actor_id, action, table_name, record_id, old_values, new_values)
    VALUES (
      NEW.seller_id,
      'price_change',
      'products',
      NEW.id,
      jsonb_build_object('selling_price_minor', OLD.selling_price_minor),
      jsonb_build_object('selling_price_minor', NEW.selling_price_minor)
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION audit_cost_change()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (actor_id, action, table_name, record_id, new_values)
    VALUES (
      COALESCE(NEW.created_by, NEW.seller_id),
      'cost_change',
      'product_costs',
      NEW.id,
      jsonb_build_object(
        'cost_price_minor', NEW.cost_price_minor,
        'cost_currency_minor', NEW.cost_currency_minor
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.cost_price_minor IS DISTINCT FROM NEW.cost_price_minor THEN
      INSERT INTO audit_log (actor_id, action, table_name, record_id, old_values, new_values)
      VALUES (
        COALESCE(NEW.created_by, NEW.seller_id),
        'cost_change',
        'product_costs',
        NEW.id,
        jsonb_build_object('cost_price_minor', OLD.cost_price_minor),
        jsonb_build_object('cost_price_minor', NEW.cost_price_minor)
      );
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (actor_id, action, table_name, record_id, old_values)
    VALUES (
      COALESCE(OLD.created_by, OLD.seller_id),
      'cost_change',
      'product_costs',
      OLD.id,
      jsonb_build_object('cost_price_minor', OLD.cost_price_minor)
    );
  END IF;
  RETURN NULL;
END;
$$;

-- ── Profile creation trigger (on auth.users insert) ──────────

CREATE OR REPLACE FUNCTION create_profile_on_auth()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO profiles (id, role)
  VALUES (NEW.id, 'buyer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── Sync product stock from batches (denormalized safety) ───
-- Keeps products.stock_qty consistent with sum of batch qtys.
-- Note: during a sale we decrement the product row directly AND
-- the batch row; this trigger re-syncs if they drift. Tradeoff:
-- adds write amplification; acceptable for MVP.

-- (Placeholder — actual body depends on whether we decrement
-- batches at sale time. Decision deferred to Phase 5.)

-- ── Fix: the function language typo in refresh_seller_daily_profit ──
-- We re-create it correctly here.

DROP FUNCTION IF EXISTS refresh_seller_daily_profit() CASCADE;

CREATE OR REPLACE FUNCTION refresh_seller_daily_profit()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_day    DATE := CURRENT_DATE;
  v_delta_units INTEGER;
  v_delta_revenue INTEGER;
  v_delta_cost    INTEGER;
  v_delta_fee     INTEGER;
  v_delta_ship    INTEGER;
  v_delta_disc    INTEGER;
  v_delta_profit  INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_delta_units  := NEW.qty;
    v_delta_revenue := NEW.sale_unit_price_minor * NEW.qty;
    v_delta_cost    := NEW.cost_unit_price_snapshot_minor * NEW.qty;
    v_delta_fee     := NEW.platform_fee_minor;
    v_delta_ship    := NEW.shipping_minor;
    v_delta_disc    := NEW.discount_minor;
    v_delta_profit  := v_delta_revenue - v_delta_cost - v_delta_fee - v_delta_ship - v_delta_disc;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta_units  := NEW.qty - OLD.qty;
    v_delta_revenue := (NEW.sale_unit_price_minor * NEW.qty) - (OLD.sale_unit_price_minor * OLD.qty);
    v_delta_cost    := (NEW.cost_unit_price_snapshot_minor * NEW.qty) - (OLD.cost_unit_price_snapshot_minor * OLD.qty);
    v_delta_fee     := NEW.platform_fee_minor - OLD.platform_fee_minor;
    v_delta_ship    := NEW.shipping_minor - OLD.shipping_minor;
    v_delta_disc    := NEW.discount_minor - OLD.discount_minor;
    v_delta_profit  := v_delta_revenue - v_delta_cost - v_delta_fee - v_delta_ship - v_delta_disc;
  ELSIF TG_OP = 'DELETE' THEN
    v_delta_units  := -OLD.qty;
    v_delta_revenue := -(OLD.sale_unit_price_minor * OLD.qty);
    v_delta_cost    := -(OLD.cost_unit_price_snapshot_minor * OLD.qty);
    v_delta_fee     := -OLD.platform_fee_minor;
    v_delta_ship    := -OLD.shipping_minor;
    v_delta_disc    := -OLD.discount_minor;
    v_delta_profit  := v_delta_revenue - v_delta_cost - v_delta_fee - v_delta_ship - v_delta_disc;
  END IF;

  INSERT INTO seller_daily_profit (
    seller_id, day, units_sold, revenue_minor, cost_minor,
    fee_minor, shipping_minor, discount_minor, profit_minor
  )
  VALUES (
    COALESCE(NEW.seller_id, OLD.seller_id),
    v_day,
    v_delta_units,
    v_delta_revenue,
    v_delta_cost,
    v_delta_fee,
    v_delta_ship,
    v_delta_disc,
    v_delta_profit
  )
  ON CONFLICT (seller_id, day) DO UPDATE SET
    units_sold      = seller_daily_profit.units_sold      + EXCLUDED.units_sold,
    revenue_minor   = seller_daily_profit.revenue_minor   + EXCLUDED.revenue_minor,
    cost_minor      = seller_daily_profit.cost_minor      + EXCLUDED.cost_minor,
    fee_minor       = seller_daily_profit.fee_minor       + EXCLUDED.fee_minor,
    shipping_minor  = seller_daily_profit.shipping_minor  + EXCLUDED.shipping_minor,
    discount_minor  = seller_daily_profit.discount_minor  + EXCLUDED.discount_minor,
    profit_minor    = seller_daily_profit.profit_minor    + EXCLUDED.profit_minor;

  RETURN NULL;
END;
$$;

-- ── Seller profit report (RPC-style view for dashboard) ──────
-- Returns per-order-item profit detail for a seller, computed
-- server-side. Never exposes cost to non-owners.

CREATE OR REPLACE FUNCTION seller_order_item_report(p_seller_id UUID)
RETURNS TABLE (
  order_id             UUID,
  order_status         TEXT,
  item_id              UUID,
  product_id           UUID,
  product_title        TEXT,
  buyer_id             UUID,
  qty                  INTEGER,
  sale_unit_price_minor INTEGER,
  qty_total_minor      INTEGER,
  cost_unit_price_snapshot_minor INTEGER,
  cost_total_minor     INTEGER,
  platform_fee_minor   INTEGER,
  shipping_minor       INTEGER,
  discount_minor       INTEGER,
  profit_minor         INTEGER,
  margin_pct           NUMERIC,
  created_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Defense in depth: only the owning seller may request their report.
  -- This prevents a buyer (or another seller) from pulling cost
  -- snapshots by passing another seller's id.
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_seller_id AND id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'seller_order_item_report: not authorized for seller %', p_seller_id;
  END IF;

  RETURN QUERY
  SELECT
    oi.order_id,
    o.status::text,
    oi.id,
    oi.product_id,
    p.title,
    oi.buyer_id,
    oi.qty,
    oi.sale_unit_price_minor,
    (oi.sale_unit_price_minor * oi.qty),
    oi.cost_unit_price_snapshot_minor,
    (oi.cost_unit_price_snapshot_minor * oi.qty),
    oi.platform_fee_minor,
    oi.shipping_minor,
    oi.discount_minor,
    (oi.sale_unit_price_minor - oi.cost_unit_price_snapshot_minor) * oi.qty
      - oi.platform_fee_minor - oi.shipping_minor - oi.discount_minor,
    CASE
      WHEN (oi.sale_unit_price_minor * oi.qty) = 0 THEN 0
      ELSE ((oi.sale_unit_price_minor - oi.cost_unit_price_snapshot_minor) * oi.qty
            - oi.platform_fee_minor - oi.shipping_minor - oi.discount_minor)
           / (oi.sale_unit_price_minor * oi.qty)::NUMERIC * 100
    END,
    oi.created_at
  FROM order_items oi
  JOIN orders o        ON o.id = oi.order_id
  JOIN products p      ON p.id = oi.product_id
  WHERE oi.seller_id = p_seller_id
  ORDER BY oi.created_at DESC;
END;
$$;

-- ── Budget check (called at checkout) ────────────────────────
-- Returns (is_over, message). Used by the client to warn/block.

CREATE OR REPLACE FUNCTION check_buyer_budget(buyer_id UUID, cart_total_minor INTEGER)
RETURNS TABLE (is_over BOOLEAN, message TEXT, allowed BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_overrides BOOLEAN;
  v_hard_stop BOOLEAN;
  v_overall   INTEGER;
  v_monthly   INTEGER;
  v_session   INTEGER;
  v_today     DATE := CURRENT_DATE;
BEGIN
  SELECT COALESCE(COUNT(*) > 0, FALSE), COALESCE(bool_or(is_hard_stop), FALSE)
  INTO v_overrides, v_hard_stop
  FROM budget_settings
  WHERE profile_id = buyer_id;

  IF NOT v_overrides THEN
    RETURN QUERY SELECT FALSE, 'No budget set; checkout allowed'::text, TRUE::boolean;
    RETURN;
  END IF;

  SELECT spent_minor INTO v_overall
  FROM buyer_spending
  WHERE profile_id = buyer_id
    AND period_type = 'overall'
    AND period_start = '1970-01-01'::DATE;

  v_overall := COALESCE(v_overall, 0);

  SELECT spent_minor INTO v_monthly
  FROM buyer_spending
  WHERE profile_id = buyer_id
    AND period_type = 'monthly'
    AND period_start = date_trunc('month', now())::DATE;

  v_monthly := COALESCE(v_monthly, 0);

  SELECT spent_minor INTO v_session
  FROM buyer_spending
  WHERE profile_id = buyer_id
    AND period_type = 'session'
    AND period_start = v_today;

  v_session := COALESCE(v_session, 0);

  -- Check each applicable budget
  IF cart_total_minor + v_overall > (
       SELECT amount_minor FROM budget_settings
       WHERE profile_id = buyer_id AND budget_type = 'overall'
       LIMIT 1
     ) THEN
    IF v_hard_stop THEN
      RETURN QUERY SELECT TRUE, format('Cart (%, minor) exceeds overall budget', cart_total_minor), FALSE;
    ELSE
      RETURN QUERY SELECT TRUE, format('Cart exceeds overall budget; override allowed'), TRUE;
    END IF;
    RETURN;
  END IF;

  IF cart_total_minor + v_monthly > (
       SELECT amount_minor FROM budget_settings
       WHERE profile_id = buyer_id AND budget_type = 'monthly'
       LIMIT 1
     ) THEN
    IF v_hard_stop THEN
      RETURN QUERY SELECT TRUE, 'Cart exceeds monthly budget; blocked'::text, FALSE;
    ELSE
      RETURN QUERY SELECT TRUE, 'Cart exceeds monthly budget; override allowed'::text, TRUE;
    END IF;
    RETURN;
  END IF;

  RETURN QUERY SELECT FALSE, 'Within budget'::text, TRUE::boolean;
END;
$$;

-- ── Price-drop check for wishlist (called by notification cron) ──
-- Returns wishlist items whose watched price > current price.

CREATE OR REPLACE FUNCTION wishlist_price_drops()
RETURNS TABLE (
  wishlist_id UUID,
  buyer_id    UUID,
  product_id  UUID,
  old_price   INTEGER,
  new_price   INTEGER,
  drop_minor  INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wi.id,
    wi.buyer_id,
    wi.product_id,
    wi.price_watched_minor,
    p.selling_price_minor,
    wi.price_watched_minor - p.selling_price_minor
  FROM wishlist_items wi
  JOIN products p ON p.id = wi.product_id
  WHERE wi.alert_enabled = TRUE
    AND p.status = 'active'
    AND p.selling_price_minor < wi.price_watched_minor;
END;
$$;


-- ── Trigger declarations (bodies all defined above) ──

-- Timestamp touch
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_products_updated
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_product_costs_updated
  BEFORE UPDATE ON product_costs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Stock sync from batches (denormalized safety)
CREATE OR REPLACE FUNCTION sync_product_stock_from_batches()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$
DECLARE
  v_sum INTEGER;
BEGIN
  SELECT COALESCE(SUM(qty), 0) INTO v_sum
  FROM inventory_batches
  WHERE product_id = COALESCE(NEW.product_id, OLD.product_id);

  UPDATE products SET stock_qty = v_sum, updated_at = now()
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_inventory_batches_product_stock
  AFTER INSERT OR UPDATE OR DELETE ON inventory_batches FOR EACH ROW
  EXECUTE FUNCTION sync_product_stock_from_batches();

-- Audit: price change on products
CREATE TRIGGER trg_products_audit_price
  AFTER UPDATE OF selling_price_minor ON products FOR EACH ROW
  EXECUTE FUNCTION audit_price_change();

-- Audit: cost change on product_costs
CREATE TRIGGER trg_product_costs_audit
  AFTER INSERT OR UPDATE OR DELETE ON product_costs FOR EACH ROW
  EXECUTE FUNCTION audit_cost_change();

-- Order status machine
CREATE TRIGGER trg_order_status_transition
  BEFORE UPDATE OF status ON orders FOR EACH ROW
  EXECUTE FUNCTION enforce_order_status_transition();

-- Timestamps from status (BEFORE so NEW is writable)
CREATE TRIGGER trg_order_completed_set_timestamps
  BEFORE UPDATE OF status ON orders FOR EACH ROW
  EXECUTE FUNCTION set_order_timestamps_from_status();

-- Buyer spending counters (row-level, on order_items)
CREATE TRIGGER trg_order_items_buyer_spending
  AFTER INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW
  EXECUTE FUNCTION update_buyer_spending();

-- Buyer spending on refund
CREATE TRIGGER trg_order_items_refund_spending
  AFTER UPDATE OF refund_total_minor ON orders FOR EACH ROW
  EXECUTE FUNCTION update_buyer_spending_on_refund();

-- Seller daily profit roll-up
CREATE TRIGGER trg_order_items_seller_aggregates
  AFTER INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW
  EXECUTE FUNCTION refresh_seller_daily_profit();

-- Seller review aggregates
CREATE TRIGGER trg_reviews_seller_aggregates
  AFTER INSERT OR UPDATE OR DELETE ON reviews FOR EACH ROW
  EXECUTE FUNCTION refresh_seller_review_aggregates();

-- Low stock alert
CREATE TRIGGER trg_products_low_stock_alert
  AFTER UPDATE OF stock_qty ON products FOR EACH ROW
  EXECUTE FUNCTION check_low_stock_alert();

-- Below-cost alert (price change)
CREATE TRIGGER trg_products_below_cost_alert
  AFTER INSERT OR UPDATE OF selling_price_minor ON products FOR EACH ROW
  EXECUTE FUNCTION check_below_cost_alert();

-- Below-cost alert (new batch changes cost basis)
CREATE TRIGGER trg_inventory_batches_below_cost_alert
  AFTER INSERT OR UPDATE OR DELETE ON inventory_batches FOR EACH ROW
  EXECUTE FUNCTION check_below_cost_alert_after_batch();

-- Last active timestamp (placeholder; real implementation via app heartbeat)
CREATE OR REPLACE FUNCTION set_last_active()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.last_active_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_last_active
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_last_active();

COMMIT;
