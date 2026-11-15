-- ============================================================
-- 001_initial_schema.sql
-- Phase 1 — Multi-vendor marketplace (kiptrack)
-- Supabase / Postgres 15
-- Conventions:
--   • Every money column is INTEGER (minor units). XAF has no
--     subunit, but the "_minor" suffix keeps the convention
--     visible when we add a currency with cents.
--   • Cost columns live in product_costs / inventory_batches ONLY.
--     No public query, view, or RPC may JOIN them except in an
--     owner-authenticated context.
--   • RLS is enabled on every table; policies are explicit, never
--     permissive.
--   • Audit log captures any change to price or cost.
-- ============================================================

BEGIN;

-- ── Extensions ──────────────────────────────────────────────
-- Supabase enables pgcrypto by default; we use gen_random_uuid().
-- We still declare it to be explicit about the dependency.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Custom types ────────────────────────────────────────────

CREATE TYPE user_role AS ENUM (
  'buyer',
  'seller',
  'both',
  'admin'
);

CREATE TYPE product_status AS ENUM (
  'draft',
  'active',
  'archived',
  'out_of_stock'
);

CREATE TYPE order_status AS ENUM (
  'placed',
  'confirmed',
  'shipped',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'disputed'
);

CREATE TYPE payment_method AS ENUM (
  'card',
  'mobile_money_mtn',
  'mobile_money_orange',
  'cash_on_delivery',
  'wallet'
);

CREATE TYPE cost_basis AS ENUM (
  'weighted_average',
  'fifo'
);

CREATE TYPE verification_status AS ENUM (
  'unverified',
  'pending',
  'verified',
  'rejected'
);

CREATE TYPE address_type AS ENUM (
  'home',
  'work',
  'other'
);

CREATE TYPE notification_channel AS ENUM (
  'push',
  'sms',
  'in_app'
);

CREATE TYPE notification_type AS ENUM (
  'order_placed',
  'order_confirmed',
  'order_shipped',
  'order_delivered',
  'order_completed',
  'order_cancelled',
  'stock_low',
  'price_dropped',
  'budget_warning',
  'new_message',
  'review_requested',
  'dispute_opened',
  'dispute_resolved',
  'payout_scheduled',
  'payout_completed'
);

CREATE TYPE report_reason AS ENUM (
  'spam',
  'counterfeit',
  'offensive',
  'fraud',
  'other'
);

CREATE TYPE dispute_status AS ENUM (
  'open',
  'under_review',
  'resolved_refund',
  'resolved_keep',
  'escalated'
);

-- ── Profiles (extends auth.users) ───────────────────────────
-- One row per authenticated user. Core identity + role + currency.
-- Seller aggregates are denormalized here for dashboard speed;
-- they are maintained by triggers on reviews / orders.

CREATE TABLE profiles (
  id                 UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role               user_role   NOT NULL DEFAULT 'buyer',
  full_name          TEXT,
  avatar_url         TEXT,
  phone              TEXT,
  phone_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
  email_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
  currency_minor_default INTEGER  NOT NULL DEFAULT 1,   -- 1 = XAF (no subunit)
  cost_basis_default cost_basis  NOT NULL DEFAULT 'weighted_average',
  seller_verification_status verification_status NOT NULL DEFAULT 'unverified',
  seller_biz_name    TEXT,
  seller_biz_reg     TEXT,                              -- business registration / ID
  seller_verification_notes TEXT,
  seller_rating_avg  NUMERIC(3,2) DEFAULT NULL,         -- denormalized, trigger-maintained
  seller_review_count INTEGER     NOT NULL DEFAULT 0,   -- denormalized
  seller_reputation_score INTEGER NOT NULL DEFAULT 100, -- 0..100, trigger-maintained
  stripe_connect_id  TEXT,                              -- for future payouts
  sms_opt_in         BOOLEAN     NOT NULL DEFAULT TRUE,
  push_opt_in        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at     TIMESTAMPTZ
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- A user can read their own profile.
CREATE POLICY " profiles: users can read own profile "
  ON profiles FOR SELECT
  USING ( auth.uid() = id );

-- A user can update their own profile (except role, which admins control).
CREATE POLICY " profiles: users can update own profile "
  ON profiles FOR UPDATE
  USING ( auth.uid() = id )
  WITH CHECK ( auth.uid() = id );

-- INSERT is driven by the auth trigger (see below), not by clients.
CREATE POLICY " profiles: no direct insert "
  ON profiles FOR INSERT
  WITH CHECK ( false );

CREATE POLICY " profiles: no direct delete "
  ON profiles FOR DELETE
  USING ( false );

-- ── Categories + translations ──────────────────────────────
-- Publicly readable. Translations keep EN + FR from day one.

CREATE TABLE categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT        NOT NULL UNIQUE,
  parent_id  UUID        REFERENCES categories(id) ON DELETE SET NULL,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  image_url  TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY " categories: public read "
  ON categories FOR SELECT
  USING ( true );

CREATE POLICY " categories: admin manage "
  ON categories FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TABLE category_translations (
  category_id UUID        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  locale      TEXT        NOT NULL CHECK ( locale IN ('en','fr') ),
  name        TEXT        NOT NULL,
  description TEXT,
  PRIMARY KEY (category_id, locale)
);

ALTER TABLE category_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY " category_translations: public read "
  ON category_translations FOR SELECT
  USING ( true );

CREATE POLICY " category_translations: admin manage "
  ON category_translations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Products (PUBLIC readable) ─────────────────────────────
-- Costs are NEVER here. See product_costs and inventory_batches.

CREATE TABLE products (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category_id        UUID        NOT NULL REFERENCES categories(id),
  title              TEXT        NOT NULL CHECK ( length(trim(title)) > 0 ),
  description        TEXT        NOT NULL DEFAULT '',
  selling_price_minor INTEGER     NOT NULL CHECK ( selling_price_minor >= 0 ),
  currency_minor     INTEGER     NOT NULL DEFAULT 1,
  stock_qty          INTEGER     NOT NULL DEFAULT 0 CHECK ( stock_qty >= 0 ),
  low_stock_threshold INTEGER     NOT NULL DEFAULT 5,
  images             TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
  variants           JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{sku, name, options}]
  barcode            TEXT,
 sku                TEXT,
  status             product_status NOT NULL DEFAULT 'draft',
  is_shipping_free   BOOLEAN     NOT NULL DEFAULT FALSE,
  shipping_minor     INTEGER     NOT NULL DEFAULT 0,     -- seller-borne shipping (0 if free/buyer pays)
  cost_basis         cost_basis  NOT NULL DEFAULT 'weighted_average',
  featured           BOOLEAN     NOT NULL DEFAULT FALSE,
  view_count         INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at       TIMESTAMPTZ
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read active products (catalog).
CREATE POLICY " products: public read active "
  ON products FOR SELECT
  USING ( status = 'active' OR auth.uid() = seller_id );

-- Authenticated users can read their own products in any status.
CREATE POLICY " products: owner read all "
  ON products FOR SELECT
  USING ( auth.uid() = seller_id );

-- Owner can insert/update/delete their own products.
CREATE POLICY " products: owner write "
  ON products FOR ALL
  USING ( auth.uid() = seller_id )
  WITH CHECK ( auth.uid() = seller_id );

-- Unique constraint required by the composite FK on product_costs
-- and inventory_batches (product_id, seller_id). Must exist before
-- those FK tables are created.
ALTER TABLE products
  ADD CONSTRAINT uq_products_id_seller UNIQUE (id, seller_id);

-- ── Product costs (OWNER ONLY) ─────────────────────────────
-- The critical privacy boundary. RLS: only the owning seller may
-- read or write. No public policy. No JOIN in any public view.

CREATE TABLE product_costs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cost_price_minor INTEGER  NOT NULL CHECK ( cost_price_minor >= 0 ),
  cost_currency_minor INTEGER NOT NULL DEFAULT 1,
  notes       TEXT,
  created_by  UUID        NOT NULL REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_product_owner
    FOREIGN KEY (product_id, seller_id)
    REFERENCES products(id, seller_id)
);

ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;

-- ONLY the owning seller may read.
CREATE POLICY " product_costs: owner read "
  ON product_costs FOR SELECT
  USING ( auth.uid() = seller_id );

-- ONLY the owning seller may write.
CREATE POLICY " product_costs: owner write "
  ON product_costs FOR ALL
  USING ( auth.uid() = seller_id )
  WITH CHECK ( auth.uid() = seller_id );

-- ── Inventory batches (OWNER ONLY) ─────────────────────────
-- Each restock is a batch with its own unit cost, enabling FIFO
-- and weighted-average. Owner-only visibility, same as costs.

CREATE TABLE inventory_batches (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  qty            INTEGER     NOT NULL CHECK ( qty > 0 ),
  unit_cost_minor INTEGER    NOT NULL CHECK ( unit_cost_minor >= 0 ),
  acquired_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  source         TEXT,                               -- supplier, restock note
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_batch_owner
    FOREIGN KEY (product_id, seller_id)
    REFERENCES products(id, seller_id)
);

ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY " inventory_batches: owner read "
  ON inventory_batches FOR SELECT
  USING ( auth.uid() = seller_id );

CREATE POLICY " inventory_batches: owner write "
  ON inventory_batches FOR ALL
  USING ( auth.uid() = seller_id )
  WITH CHECK ( auth.uid() = seller_id );

-- ── Addresses ───────────────────────────────────────────────

CREATE TABLE addresses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        address_type NOT NULL DEFAULT 'home',
  label       TEXT,
  receiver    TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  address_line1 TEXT      NOT NULL,
  address_line2 TEXT,
  city        TEXT        NOT NULL,
  region      TEXT,
  country     TEXT        NOT NULL DEFAULT 'CM',
  postal_code TEXT,
  lat         NUMERIC(9,6),
  lng         NUMERIC(9,6),
  is_default  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY " addresses: owner read "
  ON addresses FOR SELECT
  USING ( auth.uid() = profile_id );

CREATE POLICY " addresses: owner write "
  ON addresses FOR ALL
  USING ( auth.uid() = profile_id )
  WITH CHECK ( auth.uid() = profile_id );

-- ── Orders ──────────────────────────────────────────────────
-- Status machine is enforced by a trigger (see functions).

CREATE TABLE orders (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id             UUID        NOT NULL REFERENCES profiles(id),
  status               order_status NOT NULL DEFAULT 'placed',
  subtotal_minor       INTEGER     NOT NULL DEFAULT 0,
  shipping_minor       INTEGER     NOT NULL DEFAULT 0,
  discount_minor       INTEGER     NOT NULL DEFAULT 0,
  platform_fee_total_minor INTEGER  NOT NULL DEFAULT 0,
  total_minor          INTEGER     NOT NULL DEFAULT 0,
  payment_method       payment_method,
  payment_ref          TEXT,                            -- provider ref for webhook idempotency
  payment_status       TEXT        NOT NULL DEFAULT 'pending',  -- pending, paid, failed, refunded
  shipping_address_id  UUID        REFERENCES addresses(id),
  notes                TEXT,
  delivered_at         TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  refund_total_minor   INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY " orders: buyer read own "
  ON orders FOR SELECT
  USING ( auth.uid() = buyer_id );

CREATE POLICY " orders: admin read all "
  ON orders FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY " orders: buyer write own "
  ON orders FOR UPDATE
  USING ( auth.uid() = buyer_id )
  WITH CHECK ( auth.uid() = buyer_id );

-- ── Order items (snapshots frozen at sale) ─────────────────
-- cost_unit_price_snapshot_minor is populated by the sale function
-- from the current cost basis. Edits to products NEVER touch this.

CREATE TABLE order_items (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                  UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id                UUID        NOT NULL REFERENCES products(id),
  seller_id                 UUID        NOT NULL REFERENCES profiles(id),
  buyer_id                  UUID        NOT NULL REFERENCES profiles(id),
  qty                       INTEGER     NOT NULL CHECK ( qty > 0 ),
  sale_unit_price_minor     INTEGER     NOT NULL CHECK ( sale_unit_price_minor >= 0 ),
  cost_unit_price_snapshot_minor INTEGER NOT NULL CHECK ( cost_unit_price_snapshot_minor >= 0 ),
  platform_fee_minor        INTEGER     NOT NULL DEFAULT 0,
  shipping_minor            INTEGER     NOT NULL DEFAULT 0,   -- seller-borne portion for THIS item
  discount_minor            INTEGER     NOT NULL DEFAULT 0,   -- discount applied to this line
  profit_minor              INTEGER,                          -- computed by view/RPC, not stored
  currency_minor            INTEGER     NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- COST PRIVACY: order_items carries cost_unit_price_snapshot_minor,
-- which must NEVER be visible to buyers. We block ALL direct reads
-- on the table and expose data through views instead:
--   • buyer_order_items_view  — safe columns only (no cost)
--   • seller_order_items_view — all columns (cost included)
-- SECURITY DEFINER functions (create_order, seller_order_item_report)
-- bypass RLS and can read/write the cost column directly.

-- Admin can read everything.
CREATE POLICY " order_items: admin read all "
  ON order_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Writes happen through order functions, not direct client access.
CREATE POLICY " order_items: no direct write "
  ON order_items FOR ALL
  USING ( false );

-- ── Order item views (cost privacy boundary) ───────────────
-- Buyers see their own order items WITHOUT the cost snapshot.
-- Sellers see their own sales WITH the cost snapshot.
-- Views cannot have RLS policies (Postgres has no view-level RLS),
-- so isolation is enforced by a WHERE filter embedded in each view
-- definition. Postgres views run with the owner's privileges by
-- default (security_invoker = false), so the base-table RLS on
-- order_items is bypassed and the embedded WHERE is the enforcing
-- layer. Keeping the views owned by `postgres` is what makes this
-- work — do NOT set security_invoker = true on these views.

CREATE VIEW buyer_order_items_view AS
SELECT
  id, order_id, product_id, seller_id, buyer_id,
  qty, sale_unit_price_minor, platform_fee_minor,
  shipping_minor, discount_minor, currency_minor,
  created_at, updated_at
FROM order_items
WHERE buyer_id = auth.uid();

ALTER VIEW buyer_order_items_view OWNER TO postgres;

CREATE VIEW seller_order_items_view AS
SELECT
  id, order_id, product_id, seller_id, buyer_id,
  qty, sale_unit_price_minor, cost_unit_price_snapshot_minor,
  platform_fee_minor, shipping_minor, discount_minor,
  currency_minor, created_at, updated_at
FROM order_items
WHERE seller_id = auth.uid();

ALTER VIEW seller_order_items_view OWNER TO postgres;

-- Seller read access to orders goes through order_items, so this policy
-- is only valid after order_items exists.
CREATE POLICY " orders: seller read own sales "
  ON orders FOR SELECT
  USING ( EXISTS (
    SELECT 1 FROM order_items
    WHERE order_items.order_id = orders.id
      AND order_items.seller_id = auth.uid()
  ));

-- ── Cart items (ephemeral, per buyer) ──────────────────────

CREATE TABLE cart_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id),
  qty         INTEGER     NOT NULL CHECK ( qty > 0 ),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, product_id)
);

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY " cart_items: buyer read own "
  ON cart_items FOR SELECT
  USING ( auth.uid() = buyer_id );

CREATE POLICY " cart_items: buyer write own "
  ON cart_items FOR ALL
  USING ( auth.uid() = buyer_id )
  WITH CHECK ( auth.uid() = buyer_id );

-- ── Budget settings ─────────────────────────────────────────
-- Overall + monthly + per-session + optional per-category budget.
-- Stored in minor units.

CREATE TABLE budget_settings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  budget_type       TEXT        NOT NULL CHECK ( budget_type IN ('overall','monthly','session','category') ),
  amount_minor      INTEGER     NOT NULL CHECK ( amount_minor >= 0 ),
  category_id       UUID        REFERENCES categories(id),  -- only for 'category' type
  reset_period      TEXT,                                 -- 'month','session','never'
  is_hard_stop      BOOLEAN     NOT NULL DEFAULT FALSE,   -- FALSE = warn+override, TRUE = block
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, budget_type, category_id)
);

ALTER TABLE budget_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY " budget_settings: owner read/write "
  ON budget_settings FOR ALL
  USING ( auth.uid() = profile_id )
  WITH CHECK ( auth.uid() = profile_id );

-- ── Spending tracker (running totals per buyer) ─────────────
-- Denormalized counter for fast "am I over budget?" checks.
-- Maintained by triggers on order_items / refunds.

CREATE TABLE buyer_spending (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period_start    DATE        NOT NULL,                  -- for monthly: first of month
  period_type     TEXT        NOT NULL CHECK ( period_type IN ('overall','monthly','session') ),
  spent_minor     INTEGER     NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, period_type, period_start)
);

ALTER TABLE buyer_spending ENABLE ROW LEVEL SECURITY;

CREATE POLICY " buyer_spending: owner read "
  ON buyer_spending FOR SELECT
  USING ( auth.uid() = profile_id );

-- ── Wishlist + price-drop alerts ────────────────────────────

CREATE TABLE wishlist_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_watched_minor INTEGER NOT NULL,                  -- price at time of wishlisting
  alert_enabled BOOLEAN   NOT NULL DEFAULT TRUE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, product_id)
);

ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY " wishlist: buyer read/write own "
  ON wishlist_items FOR ALL
  USING ( auth.uid() = buyer_id )
  WITH CHECK ( auth.uid() = buyer_id );

-- ── Reviews (verified purchasers only) ──────────────────────

CREATE TABLE reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_item_id UUID      REFERENCES order_items(id),
  rating      INTEGER     NOT NULL CHECK ( rating BETWEEN 1 AND 5 ),
  title       TEXT        NOT NULL CHECK ( length(trim(title)) > 0 ),
  body        TEXT        NOT NULL DEFAULT '',
  is_verified_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  status      TEXT        NOT NULL DEFAULT 'published',  -- published, hidden, rejected
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, buyer_id, order_item_id)
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY " reviews: public read published "
  ON reviews FOR SELECT
  USING ( status = 'published' OR auth.uid() = buyer_id );

CREATE POLICY " reviews: buyer manage own "
  ON reviews FOR ALL
  USING ( auth.uid() = buyer_id )
  WITH CHECK ( auth.uid() = buyer_id );

CREATE POLICY " reviews: seller read for own products "
  ON reviews FOR SELECT
  USING ( auth.uid() = seller_id );

-- ── Disputes ────────────────────────────────────────────────

CREATE TABLE disputes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        NOT NULL REFERENCES orders(id),
  buyer_id     UUID        NOT NULL REFERENCES profiles(id),
  seller_id    UUID        NOT NULL REFERENCES profiles(id),
  order_item_id UUID      REFERENCES order_items(id),
  reason       report_reason NOT NULL,
  description  TEXT        NOT NULL,
  status       dispute_status NOT NULL DEFAULT 'open',
  resolution   TEXT,
  resolved_by  UUID        REFERENCES profiles(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY " disputes: buyer read own "
  ON disputes FOR SELECT
  USING ( auth.uid() = buyer_id );

CREATE POLICY " disputes: seller read own "
  ON disputes FOR SELECT
  USING ( auth.uid() = seller_id );

CREATE POLICY " disputes: admin full "
  ON disputes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Reports (buyer or seller report a product/user) ─────────

CREATE TABLE reports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID        NOT NULL REFERENCES profiles(id),
  report_target_type TEXT  NOT NULL CHECK ( report_target_type IN ('product','seller','order','review') ),
  report_target_id   UUID  NOT NULL,
  reason      report_reason NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT 'open',  -- open, reviewed, dismissed
  reviewed_by UUID        REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY " reports: reporter read own "
  ON reports FOR SELECT
  USING ( auth.uid() = reporter_id );

CREATE POLICY " reports: admin full "
  ON reports FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Chat messages (buyer <-> seller per order) ─────────────

CREATE TABLE chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_id   UUID        NOT NULL REFERENCES profiles(id),
  receiver_id UUID        NOT NULL REFERENCES profiles(id),
  body        TEXT        NOT NULL CHECK ( length(trim(body)) > 0 ),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY " chat: participants read "
  ON chat_messages FOR SELECT
  USING ( auth.uid() = sender_id OR auth.uid() = receiver_id );

CREATE POLICY " chat: participants write "
  ON chat_messages FOR INSERT
  WITH CHECK ( auth.uid() = sender_id );

-- ── Notifications ───────────────────────────────────────────

CREATE TABLE notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  channel     notification_channel NOT NULL DEFAULT 'in_app',
  title       TEXT        NOT NULL,
  body        TEXT,
  data        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY " notifications: owner read "
  ON notifications FOR SELECT
  USING ( auth.uid() = profile_id );

CREATE POLICY " notifications: owner write "
  ON notifications FOR UPDATE
  USING ( auth.uid() = profile_id )
  WITH CHECK ( auth.uid() = profile_id );

-- ── Transactions / double-entry ledger ──────────────────────
-- Accounts are rows in the accounts table; each entry debits one
-- and credits another. The sum of all entries must be zero per
-- transaction group.

CREATE TABLE accounts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL for platform/internal accounts
  account_type TEXT       NOT NULL CHECK ( account_type IN (
                  'buyer','seller','platform_pending','platform_income',
                  'platform_expense','refund_contingency','wallet','system')
                ),
  label       TEXT        NOT NULL,
  currency_minor INTEGER   NOT NULL DEFAULT 1,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY " accounts: admin full "
  ON accounts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE TABLE ledger_entries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_ref UUID        NOT NULL,                     -- groups entries per transaction
  account_id      UUID        NOT NULL REFERENCES accounts(id),
  entry_type      TEXT        NOT NULL CHECK ( entry_type IN ('debit','credit') ),
  amount_minor    INTEGER     NOT NULL CHECK ( amount_minor > 0 ),
  currency_minor  INTEGER     NOT NULL DEFAULT 1,
  ref_type        TEXT,                                     -- 'order','refund','payout','commission','adjustment'
  ref_id          UUID,                                     -- id of the ref object
  memo            TEXT,
  created_by      UUID        NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY " ledger: admin read "
  ON ledger_entries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY " ledger: owner read own accounts "
  ON ledger_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM accounts
      WHERE accounts.id = ledger_entries.account_id
        AND accounts.profile_id = auth.uid()
    )
  );

-- ── Seller payouts ──────────────────────────────────────────

CREATE TABLE payouts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID        NOT NULL REFERENCES profiles(id),
  account_id      UUID        NOT NULL REFERENCES accounts(id),
  amount_minor    INTEGER     NOT NULL CHECK ( amount_minor > 0 ),
  currency_minor  INTEGER     NOT NULL DEFAULT 1,
  status          TEXT        NOT NULL DEFAULT 'scheduled',  -- scheduled, in_transit, completed, failed
  payment_ref     TEXT,
  scheduled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  failure_reason  TEXT,
  created_by      UUID        NOT NULL REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY " payouts: seller read own "
  ON payouts FOR SELECT
  USING ( auth.uid() = seller_id );

CREATE POLICY " payouts: admin full "
  ON payouts FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Audit log (price/cost changes + sensitive writes) ───────

CREATE TABLE audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        NOT NULL REFERENCES profiles(id),
  action      TEXT        NOT NULL,                       -- price_change, cost_change, status_change, ...
  table_name  TEXT        NOT NULL,
  record_id   UUID        NOT NULL,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY " audit: admin read "
  ON audit_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Product alerts (price-below-cost + low stock) ───────────

CREATE TABLE product_alerts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type  TEXT        NOT NULL CHECK ( alert_type IN ('below_cost','low_stock','out_of_stock','price_changed') ),
  message     TEXT        NOT NULL,
  is_resolved BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE product_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY " alerts: owner read/write "
  ON product_alerts FOR ALL
  USING ( auth.uid() = seller_id )
  WITH CHECK ( auth.uid() = seller_id );

-- ── Indexes ─────────────────────────────────────────────────
-- Search / filter paths + FK performance + RLS-friendly coverage.

CREATE INDEX idx_products_seller_status       ON products (seller_id, status);
CREATE INDEX idx_products_category_active     ON products (category_id, status) WHERE status = 'active';
CREATE INDEX idx_products_price_active        ON products (selling_price_minor) WHERE status = 'active';
CREATE INDEX idx_products_search              ON products USING gin (
  to_tsvector('simple', title || ' ' || description)
);
CREATE INDEX idx_products_updated_at          ON products (updated_at DESC);
CREATE INDEX idx_products_sku_barcode         ON products (sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_products_barcode             ON products (barcode) WHERE barcode IS NOT NULL;

CREATE INDEX idx_order_items_order            ON order_items (order_id);
CREATE INDEX idx_order_items_seller          ON order_items (seller_id);
CREATE INDEX idx_order_items_buyer           ON order_items (buyer_id);
CREATE INDEX idx_order_items_product         ON order_items (product_id);
CREATE INDEX idx_order_items_created         ON order_items (created_at DESC);

CREATE INDEX idx_orders_buyer                ON orders (buyer_id);
CREATE INDEX idx_orders_status               ON orders (status);
CREATE INDEX idx_orders_created              ON orders (created_at DESC);
CREATE INDEX idx_orders_payment_ref          ON orders (payment_ref) WHERE payment_ref IS NOT NULL;

CREATE INDEX idx_profiles_role               ON profiles (role);
CREATE INDEX idx_profiles_seller_rating      ON profiles (seller_rating_avg) WHERE seller_rating_avg IS NOT NULL;
CREATE INDEX idx_profiles_currency           ON profiles (currency_minor_default);

CREATE INDEX idx_categories_parent           ON categories (parent_id);
CREATE INDEX idx_categories_slug             ON categories (slug);
CREATE INDEX idx_category_translations_locale ON category_translations (locale);

CREATE INDEX idx_reviews_product             ON reviews (product_id);
CREATE INDEX idx_reviews_buyer               ON reviews (buyer_id);
CREATE INDEX idx_reviews_rating              ON reviews (rating);

CREATE INDEX idx_ledger_entries_ref          ON ledger_entries (transaction_ref);
CREATE INDEX idx_ledger_entries_account      ON ledger_entries (account_id);
CREATE INDEX idx_ledger_entries_created      ON ledger_entries (created_at DESC);

CREATE INDEX idx_buyer_spending_profile      ON buyer_spending (profile_id, period_type, period_start);

CREATE INDEX idx_notifications_profile_read  ON notifications (profile_id, read_at) WHERE read_at IS NULL;

CREATE INDEX idx_audit_log_actor             ON audit_log (actor_id);
CREATE INDEX idx_audit_log_table_record      ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_created           ON audit_log (created_at DESC);

-- ── Triggers (bodies + attachments in 002_functions_and_triggers.sql)
-- The functions referenced below are all created in the next migration
-- so that definitions precede trigger attachment. Do not run 001 alone.

-- ── Platform settings (commission, fees, feature flags) ─────────
-- Replaces the hardcoded 5% in create_order with a configured value.

CREATE TABLE platform_settings (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key            TEXT        NOT NULL UNIQUE,
  value          JSONB       NOT NULL,
  updated_by     UUID        REFERENCES profiles(id),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY " platform_settings: admin manage "
  ON platform_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed the commission rate (stored as a fraction, e.g. 0.05 = 5%).
INSERT INTO platform_settings (id, key, value)
VALUES (
  gen_random_uuid(),
  'commission',
  jsonb_build_object('rate', 0.05, 'currency_minor', 1, 'updated_at', now())
)
ON CONFLICT (key) DO NOTHING;

-- ── Support tickets (P1: reachable support, in-app ticket + admin inbox) ──

CREATE TABLE support_tickets (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject      TEXT        NOT NULL CHECK ( length(trim(subject)) > 0 ),
  body         TEXT        NOT NULL CHECK ( length(trim(body)) > 0 ),
  channel      TEXT        NOT NULL DEFAULT 'in_app',  -- in_app, whatsapp, email
  status       TEXT        NOT NULL DEFAULT 'open',    -- open, in_progress, resolved, closed
  priority     TEXT        NOT NULL DEFAULT 'normal',  -- low, normal, high, urgent
  assigned_to  UUID        REFERENCES profiles(id),
  resolved_by  UUID        REFERENCES profiles(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY " tickets: owner read/write own "
  ON support_tickets FOR ALL
  USING ( auth.uid() = profile_id )
  WITH CHECK ( auth.uid() = profile_id );

CREATE POLICY " tickets: admin full "
  ON support_tickets FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Ticket conversation threads (admin <-> user) ─────────────

CREATE TABLE ticket_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID        NOT NULL REFERENCES profiles(id),
  body        TEXT        NOT NULL CHECK ( length(trim(body)) > 0 ),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY " ticket_messages: participants read "
  ON ticket_messages FOR SELECT
  USING ( auth.uid() = sender_id OR
          EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND profile_id = auth.uid()) OR
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') );

CREATE POLICY " ticket_messages: participants write "
  ON ticket_messages FOR INSERT
  WITH CHECK ( auth.uid() = sender_id );

-- ── Category attribute templates (P3: data-driven verticals) ──
-- Each category can define the attributes a seller must/can fill
-- when listing a product in that category. New verticals = new
-- rows, no code change.

CREATE TABLE category_attributes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL CHECK ( length(trim(name)) > 0 ),
  attribute_type  TEXT        NOT NULL CHECK ( attribute_type IN (
                     'text','number','select','multiselect','date','boolean','file','barcode','sku')
                   ),
  is_required     BOOLEAN     NOT NULL DEFAULT FALSE,
  options         JSONB,                                    -- for select/multiselect: [{"value":"M","label":"M"}]
  unit           TEXT,                                       -- e.g. 'kg','liter','piece','cm'
  default_value   JSONB,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE category_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY " category_attributes: public read "
  ON category_attributes FOR SELECT
  USING ( true );

CREATE POLICY " category_attributes: admin manage "
  ON category_attributes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Per-product attribute values (the actual filled-in values).
-- Stored as JSONB so each product can carry its own values for the
-- category's attribute template without altering the schema.

CREATE TABLE product_attributes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id     UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  values        JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- {"size":"M","color":"red"}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);

ALTER TABLE product_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY " product_attributes: owner write "
  ON product_attributes FOR ALL
  USING ( auth.uid() = (SELECT seller_id FROM products WHERE id = product_id) )
  WITH CHECK ( auth.uid() = (SELECT seller_id FROM products WHERE id = product_id) );

CREATE POLICY " product_attributes: public read (for catalog display) "
  ON product_attributes FOR SELECT
  USING ( EXISTS (
    SELECT 1 FROM products
    WHERE products.id = product_attributes.product_id
      AND (products.status = 'active' OR auth.uid() = products.seller_id)
  ));

-- ── Product attribute change log (audit for attribute edits) ──

CREATE TABLE product_attribute_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id     UUID        NOT NULL REFERENCES profiles(id),
  old_values    JSONB,
  new_values    JSONB        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE product_attribute_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY " attr_history: owner read "
  ON product_attribute_history FOR SELECT
  USING ( auth.uid() = seller_id );

CREATE POLICY " attr_history: admin read "
  ON product_attribute_history FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── Indexes for tables defined above ───────────────────────

CREATE INDEX idx_support_tickets_profile ON support_tickets (profile_id);
CREATE INDEX idx_support_tickets_status   ON support_tickets (status);
CREATE INDEX idx_support_tickets_created  ON support_tickets (created_at DESC);
CREATE INDEX idx_ticket_messages_ticket   ON ticket_messages (ticket_id);

CREATE INDEX idx_category_attributes_category ON category_attributes (category_id);
CREATE INDEX idx_product_attributes_product    ON product_attributes (product_id);
CREATE INDEX idx_product_attr_history_product  ON product_attribute_history (product_id);
COMMIT;
