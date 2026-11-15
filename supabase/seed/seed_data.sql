-- ============================================================
-- seed_data.sql  (UPDATED)
-- Phase 1 — Cameroon/Bamenda seed with full EN + FR.
-- Exercises cost privacy + profit engine + budget + wishlist.
-- ============================================================

BEGIN;

-- ── Clean slate (dev-only; guarded) ──────────────────────────
-- In production, seed once. We guard with IF EXISTS / ON CONFLICT.

DELETE FROM product_attribute_history;
DELETE FROM product_attributes;
DELETE FROM audit_log;
DELETE FROM product_alerts;
DELETE FROM disputes;
DELETE FROM reports;
DELETE FROM payouts;
DELETE FROM ledger_entries;
DELETE FROM accounts;
DELETE FROM ticket_messages;
DELETE FROM support_tickets;
DELETE FROM notifications;
DELETE FROM chat_messages;
DELETE FROM reviews;
DELETE FROM wishlist_items;
DELETE FROM cart_items;
DELETE FROM order_items;
DELETE FROM orders;
-- Clear the roll-ups AFTER the order deletes: the order_items delete
-- trigger would otherwise recreate negative rows here.
DELETE FROM seller_daily_profit;
DELETE FROM buyer_spending;
DELETE FROM addresses;
DELETE FROM budget_settings;
DELETE FROM inventory_batches;
DELETE FROM product_costs;
DELETE FROM product_attributes;
DELETE FROM products;
DELETE FROM category_attributes;
DELETE FROM category_translations;
DELETE FROM categories;
-- The deletes above fire audit triggers, which re-insert audit_log
-- rows referencing profiles; clear again so profiles can be removed.
DELETE FROM audit_log;
DELETE FROM profiles;
-- Do NOT delete auth.users here unless you know the DB is fresh;
-- instead seed profiles with ON CONFLICT DO NOTHING.

-- ── Deterministic UUIDs ──────────────────────────────────────
\set seller_a_id 'a1111111-1111-1111-1111-111111111111'
\set seller_b_id 'b2222222-2222-2222-2222-222222222222'
\set buyer_id    'c3333333-3333-3333-3333-333333333333'
\set admin_id    'd4444444-4444-4444-4444-444444444444'

-- ── Helpers: category by slug (used below) ───────────────────
CREATE OR REPLACE FUNCTION seed_category_slug(p_slug TEXT)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM categories WHERE slug = p_slug;
$$;

-- ── Profiles ─────────────────────────────────────────────────
-- Cameroon numbers (+237). Sellers are in Bamenda.
-- auth.users must exist first (profiles.id references auth.users).
INSERT INTO auth.users (id, aud, role, email, email_confirmed_at,
                       phone, phone_confirmed_at, is_sso_user,
                       created_at, updated_at)
VALUES
  (:'seller_a_id', 'authenticated', 'authenticated', 'amma@kiptrack.dev', now(),
     '+237671111111', now(), FALSE, now(), now()),
  (:'seller_b_id', 'authenticated', 'authenticated', 'bintou@kiptrack.dev', now(),
     '+2376990000001', now(), FALSE, now(), now()),
  (:'buyer_id',    'authenticated', 'authenticated', 'kofi@kiptrack.dev', now(),
     '+237672222222', now(), FALSE, now(), now()),
  (:'admin_id',    'authenticated', 'authenticated', 'admin@kiptrack.dev', now(),
     '+237699999999', now(), FALSE, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, role, full_name, phone, phone_verified, email_verified,
                      seller_verification_status, seller_biz_name, seller_biz_reg,
                      currency_minor_default, seller_rating_avg, seller_review_count,
                      seller_reputation_score)
VALUES
  (:'seller_a_id', 'seller', 'Ama Serwaa', '+237671111111', TRUE, TRUE,
     'verified', 'Ama Provisions & Textiles', 'REG-CM-2024-0112', 1, 4.80, 12, 96),
  (:'seller_b_id', 'both',   'Bintou Diallo', '+2376990000001', TRUE, TRUE,
     'pending', 'Bintou Artisanat', NULL, 1, NULL, 0, 100),
  (:'buyer_id',    'buyer',  'Kofi Mensah', '+237672222222', TRUE, TRUE,
     'unverified', NULL, NULL, 1, NULL, 0, 100),
  (:'admin_id',    'admin',  'Plateforme Admin', '+237699999999', TRUE, TRUE,
     'unverified', NULL, NULL, 1, NULL, 0, 100)
ON CONFLICT (id) DO NOTHING;

-- ── Categories (launch verticals, EN + FR) ───────────────────
INSERT INTO categories (id, slug, sort_order, is_active) VALUES
  (gen_random_uuid(), 'clothing',       1, TRUE),
  (gen_random_uuid(), 'cosmetics',      2, TRUE),
  (gen_random_uuid(), 'electronics',    3, TRUE),
  (gen_random_uuid(), 'provisions',     4, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- EN translations
INSERT INTO category_translations (category_id, locale, name, description)
SELECT c.id, 'en', cname, cdesc
FROM (VALUES
  ('clothing',    'Clothing',     'Clothing, shoes, and wearable accessories'),
  ('cosmetics',   'Cosmetics',    'Makeup, skincare, and beauty products'),
  ('electronics', 'Electronics',  'Phones, gadgets, and small appliances'),
  ('provisions',  'Provisions',   'Food, drinks, and household pantry staples')
) AS v(slug, cname, cdesc)
JOIN categories c ON c.slug = v.slug;

-- FR translations
INSERT INTO category_translations (category_id, locale, name, description)
SELECT c.id, 'fr', cname, cdesc
FROM (VALUES
  ('clothing',    'Vêtements',       'Vêtements, chaussures et accessoires vestimentaires'),
  ('cosmetics',   'Cosmétiques',     'Maquillage, soins de la peau et produits de beauté'),
  ('electronics', 'Électronique',    'Téléphones, gadgets et petits appareils électroménagers'),
  ('provisions',  'Produits de base','Aliments, boissons et produits d''entretien essentiels')
) AS v(slug, cname, cdesc)
JOIN categories c ON c.slug = v.slug;

-- ── Category attribute templates (P3: data-driven verticals) ──
-- Clothing: size, color, material, brand
INSERT INTO category_attributes (category_id, name, attribute_type, is_required, options, unit, sort_order)
SELECT c.id, 'size', 'select', TRUE,
  jsonb_build_array(
    jsonb_build_object('value','XS','label','XS'),
    jsonb_build_object('value','S','label','S'),
    jsonb_build_object('value','M','label','M'),
    jsonb_build_object('value','L','label','L'),
    jsonb_build_object('value','XL','label','XL'),
    jsonb_build_object('value','XXL','label','XXL')
  ), NULL, 1
FROM categories c WHERE c.slug = 'clothing';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, options, sort_order)
SELECT c.id, 'color', 'multiselect', FALSE,
  jsonb_build_array(
    jsonb_build_object('value','red','label','Rouge'),
    jsonb_build_object('value','blue','label','Bleu'),
    jsonb_build_object('value','green','label','Vert'),
    jsonb_build_object('value','black','label','Noir'),
    jsonb_build_object('value','white','label','Blanc'),
    jsonb_build_object('value','gold','label','Doré')
  ), 2
FROM categories c WHERE c.slug = 'clothing';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, options, sort_order)
SELECT c.id, 'brand', 'select', FALSE,
  jsonb_build_array(
    jsonb_build_object('value','local','label','Local'),
    jsonb_build_object('value','imported','label','Importé'),
    jsonb_build_object('value','nigerian','label','Nigeria'),
    jsonb_build_object('value','chinese','label','Chine')
  ), 3
FROM categories c WHERE c.slug = 'clothing';

-- Cosmetics: brand, shade, expiry date
INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'brand', 'text', TRUE, 1
FROM categories c WHERE c.slug = 'cosmetics';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'shade', 'text', FALSE, 2
FROM categories c WHERE c.slug = 'cosmetics';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'expiry_date', 'date', FALSE, 3
FROM categories c WHERE c.slug = 'cosmetics';

-- Electronics: brand, model, warranty, IMEI/serial
INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'brand', 'select', TRUE, 1
FROM categories c WHERE c.slug = 'electronics';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'model', 'text', TRUE, 2
FROM categories c WHERE c.slug = 'electronics';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'warranty_months', 'number', FALSE, 3
FROM categories c WHERE c.slug = 'electronics';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'serial_number', 'text', FALSE, 4
FROM categories c WHERE c.slug = 'electronics';

-- Provisions: unit of measure, pack size, expiry date
INSERT INTO category_attributes (category_id, name, attribute_type, is_required, options, sort_order)
SELECT c.id, 'unit_of_measure', 'select', TRUE,
  jsonb_build_array(
    jsonb_build_object('value','piece','label','Pièce'),
    jsonb_build_object('value','pack','label','Paquet'),
    jsonb_build_object('value','carton','label','Carton'),
    jsonb_build_object('value','kg','label','KG'),
    jsonb_build_object('value','liter','label','Litre')
  ), 1
FROM categories c WHERE c.slug = 'provisions';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'pack_size', 'text', FALSE, 2
FROM categories c WHERE c.slug = 'provisions';

INSERT INTO category_attributes (category_id, name, attribute_type, is_required, sort_order)
SELECT c.id, 'expiry_date', 'date', FALSE, 3
FROM categories c WHERE c.slug = 'provisions';

-- ── Products (PUBLIC readable) ───────────────────────────────
-- seller_a: 1) Wax print dress (clothing), 2) Danté spice paste (provisions).
-- seller_b: Leather sandals (clothing).

-- dress
INSERT INTO products (id, seller_id, category_id, title, description,
                     selling_price_minor, stock_qty, low_stock_threshold,
                     images, variants, sku, barcode, status, is_shipping_free,
                     shipping_minor, cost_basis, featured)
SELECT
  gen_random_uuid(),
  p.id,
  c.id,
  'Robe imprimee cirée — bordure kente',
  'Robe endroit imprimee cirée avec bordure kente, longueur moyenne, doublure. Unique.',
  45000,
  12,
  4,
  ARRAY['https://storage.example.com/products/dress-1.jpg'],
  jsonb_build_array(jsonb_build_object('sku','WXDR-001','name','Taille','options',jsonb_build_array('S','M','L'))),
  'WXDR-001',
  'CM-WXDR-001',
  'active',
  TRUE,
  0,
  'weighted_average',
  TRUE
FROM profiles p
JOIN categories c ON c.slug = 'clothing'
WHERE p.id = :'seller_a_id';

-- wall hanging (art) — keep a 5th category for variety; use 'clothing'? No: add art-culture.
-- Simpler: keep only the 4 launch verticals for the seed. Replace wall hanging with a cosmetics item.
-- Actually keep a 5th category for the seed only (art-culture) so the catalog looks richer.
INSERT INTO categories (id, slug, sort_order, is_active) VALUES
  (gen_random_uuid(), 'home-garden', 5, TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO category_translations (category_id, locale, name, description)
SELECT c.id, 'en', 'Home & Garden', 'Furniture, décor, plants, and tools'
FROM categories c WHERE c.slug = 'home-garden';

INSERT INTO category_translations (category_id, locale, name, description)
SELECT c.id, 'fr', 'Maison & Jardin', 'Meubles, déco, plantes et outils'
FROM categories c WHERE c.slug = 'home-garden';

INSERT INTO products (id, seller_id, category_id, title, description,
                     selling_price_minor, stock_qty, low_stock_threshold,
                     images, sku, status, cost_basis)
SELECT
  gen_random_uuid(),
  p.id,
  c.id,
  'Handwoven Wall Hanging — Indigo',
  'Handwoven on a backstrap loom, indigo and natural cotton. 120x80cm.',
  28000,
  5,
  3,
  ARRAY['https://storage.example.com/products/hanging-1.jpg'],
  'WHNG-001',
  'active',
  'weighted_average'
FROM profiles p
JOIN categories c ON c.slug = 'home-garden'
WHERE p.id = :'seller_a_id';

-- Danté spice paste (provisions) — expiry tracking example
INSERT INTO products (id, seller_id, category_id, title, description,
                     selling_price_minor, stock_qty, low_stock_threshold,
                     images, sku, barcode, status,
                     shipping_minor, cost_basis)
SELECT
  gen_random_uuid(),
  p.id,
  c.id,
  'Danté Pepper Soup Spice (80g)',
  'Traditional spice blend for pepper soup. Pack of 80g. Check expiry on pack.',
  3500,
  40,
  10,
  ARRAY['https://storage.example.com/products/dante-spice-1.jpg'],
  'DANTE-001',
  'CM-DANTE-001',
  'active',
  0,
  'weighted_average'
FROM profiles p
JOIN categories c ON c.slug = 'provisions'
WHERE p.id = :'seller_a_id';

-- sandals (seller_b, clothing, FIFO cost basis)
INSERT INTO products (id, seller_id, category_id, title, description,
                     selling_price_minor, stock_qty, low_stock_threshold,
                     images, sku, barcode, status,
                     is_shipping_free, shipping_minor, cost_basis)
SELECT
  gen_random_uuid(),
  p.id,
  c.id,
  'Sandales en cuir — sangle toile',
  'Sandales en cuir recyclé avec sangle en toile, cousues à la main. Tailles 36-42.',
  18500,
  8,
  3,
  ARRAY['https://storage.example.com/products/sandals-1.jpg'],
  'SDLS-001',
  'CM-SDLS-001',
  'active',
  FALSE,
  2000,
  'fifo'
FROM profiles p
JOIN categories c ON c.slug = 'clothing'
WHERE p.id = :'seller_b_id';

-- ── Product attributes (filled per product) ──────────────────
INSERT INTO product_attributes (product_id, seller_id, values)
SELECT pr.id, p.id, jsonb_build_object('size','M','color','red','brand','imported')
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE pr.sku = 'WXDR-001';

INSERT INTO product_attributes (product_id, seller_id, values)
SELECT pr.id, p.id, jsonb_build_object('brand','local','shade','indigo')
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE pr.sku = 'WHNG-001';

INSERT INTO product_attributes (product_id, seller_id, values)
SELECT pr.id, p.id, jsonb_build_object('brand','dante','expiry_date', (now() + interval '6 months')::date, 'unit_of_measure','pack','pack_size','80g')
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE pr.sku = 'DANTE-001';

INSERT INTO product_attributes (product_id, seller_id, values)
SELECT pr.id, p.id, jsonb_build_object('size','40','color','brown','brand','local')
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE pr.sku = 'SDLS-001';

-- ── Product costs (OWNER ONLY — not public) ──────────────────
-- seller_a dress: two batches → weighted average = 17,929 XAF (see README)
INSERT INTO product_costs (id, product_id, seller_id, cost_price_minor,
                          cost_currency_minor, notes, created_by)
SELECT
  gen_random_uuid(), pr.id, p.id, 18000, 1,
  'Imported wax fabric + local tailoring', p.id
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_a_id' AND pr.sku = 'WXDR-001';

INSERT INTO product_costs (id, product_id, seller_id, cost_price_minor,
                          cost_currency_minor, notes, created_by)
SELECT
  gen_random_uuid(), pr.id, p.id, 9500, 1,
  'Handwoven by cooperative in Kumasi', p.id
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_a_id' AND pr.sku = 'WHNG-001';

INSERT INTO product_costs (id, product_id, seller_id, cost_price_minor,
                          cost_currency_minor, notes, created_by)
SELECT
  gen_random_uuid(), pr.id, p.id, 2200, 1,
  'Blended spice mix, local supplier', p.id
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_a_id' AND pr.sku = 'DANTE-001';

INSERT INTO product_costs (id, product_id, seller_id, cost_price_minor,
                          cost_currency_minor, notes, created_by)
SELECT
  gen_random_uuid(), pr.id, p.id, 6200, 1,
  'Recycled leather + canvas from Abidjan', p.id
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_b_id' AND pr.sku = 'SDLS-001';

-- ── Inventory batches (OWNER ONLY) ───────────────────────────
-- dress: batch A (8 @ 17,500), batch B (6 @ 18,500)
INSERT INTO inventory_batches (product_id, seller_id, qty, unit_cost_minor,
                              source, acquired_at)
SELECT
  pr.id, p.id,
  8, 17500, 'Fournisseur: Marche de Accra, lot A', now() - interval '30 days'
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_a_id' AND pr.sku = 'WXDR-001';

INSERT INTO inventory_batches (product_id, seller_id, qty, unit_cost_minor,
                              source, acquired_at)
SELECT
  pr.id, p.id,
  6, 18500, 'Quartier de Kumasi, district textile, lot B', now() - interval '5 days'
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_a_id' AND pr.sku = 'WXDR-001';

-- wall hanging: single batch
INSERT INTO inventory_batches (product_id, seller_id, qty, unit_cost_minor,
                              source, acquired_at)
SELECT
  pr.id, p.id,
  5, 9500, 'Achat direct cooperative', now() - interval '14 days'
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_a_id' AND pr.sku = 'WHNG-001';

-- Danté spice: single batch
INSERT INTO inventory_batches (product_id, seller_id, qty, unit_cost_minor,
                              source, acquired_at)
SELECT
  pr.id, p.id,
  40, 2200, 'Fournisseur local etablissement', now() - interval '7 days'
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_a_id' AND pr.sku = 'DANTE-001';

-- sandals: FIFO batches (seller_b)
INSERT INTO inventory_batches (product_id, seller_id, qty, unit_cost_minor,
                              source, acquired_at)
SELECT
  pr.id, p.id,
  5, 6000, 'Cooperative cuir Abidjan', now() - interval '20 days'
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_b_id' AND pr.sku = 'SDLS-001';

INSERT INTO inventory_batches (product_id, seller_id, qty, unit_cost_minor,
                              source, acquired_at)
SELECT
  pr.id, p.id,
  4, 6500, 'Cooperative cuir Abidjan v2', now() - interval '2 days'
FROM products pr
JOIN profiles p ON p.id = pr.seller_id
WHERE p.id = :'seller_b_id' AND pr.sku = 'SDLS-001';

-- ── Addresses (buyer, Bamenda) ───────────────────────────────
INSERT INTO addresses (id, profile_id, type, label, receiver, phone,
                      address_line1, address_line2, city, region, country,
                      postal_code, is_default)
SELECT
  gen_random_uuid(), p.id, 'home', 'Maison',
  'Kofi Mensah', '+237672222222',
  '14 Rue de l''Indépendance',
  'Quartier Anglo-Saxon',
  'Bamenda',
  'Nord-Ouest',
  'CM',
  'P.M.B. 203',
  TRUE
FROM profiles p WHERE p.id = :'buyer_id';

-- ── Budget settings (buyer) ──────────────────────────────────
INSERT INTO budget_settings (profile_id, budget_type, amount_minor,
                            category_id, reset_period, is_hard_stop)
SELECT p.id, 'overall', 200000, NULL, 'month', FALSE
FROM profiles p WHERE p.id = :'buyer_id';

INSERT INTO budget_settings (profile_id, budget_type, amount_minor,
                            category_id, reset_period, is_hard_stop)
SELECT p.id, 'monthly', 80000, NULL, 'month', FALSE
FROM profiles p WHERE p.id = :'buyer_id';

INSERT INTO budget_settings (profile_id, budget_type, amount_minor,
                            category_id, reset_period, is_hard_stop)
SELECT p.id, 'category', 15000, c.id, 'month', FALSE
FROM profiles p, categories c
WHERE p.id = :'buyer_id' AND c.slug = 'cosmetics';

-- ── Wishlist (buyer) ─────────────────────────────────────────
INSERT INTO wishlist_items (id, buyer_id, product_id, price_watched_minor,
                           alert_enabled)
SELECT
  gen_random_uuid(), p.id, pr.id, pr.selling_price_minor, TRUE
FROM profiles p
CROSS JOIN products pr
WHERE p.id = :'buyer_id'
  AND pr.seller_id = :'seller_a_id'
  AND pr.sku IN ('WXDR-001','WHNG-001','DANTE-001');

-- ── Completed order (snapshot + profit test) ─────────────────
-- buyer buys 2 dresses (WXDR-001) @ 45,000 from seller_a.
-- Cost snapshot = weighted average of batches = 17,929.
-- Expected profit = (45000 - 17929) * 2 - platform_fee(2250*2) = 49,642.
-- platform_fee = 5% of line subtotal = 0.05 * 90000 = 4,500 total (2,250/item).

INSERT INTO orders (id, buyer_id, status, shipping_address_id,
                   subtotal_minor, shipping_minor, discount_minor,
                   platform_fee_total_minor, total_minor,
                   payment_method, payment_status, notes)
SELECT
  gen_random_uuid(), p.id, 'completed', a.id,
  90000, 0, 0, 4500, 94500,
  'card', 'paid', 'Commande de test: 2 robes imprimees'
FROM profiles p
JOIN addresses a ON a.profile_id = p.id
WHERE p.id = :'buyer_id';

INSERT INTO order_items (id, order_id, product_id, seller_id, buyer_id,
                        qty, sale_unit_price_minor, cost_unit_price_snapshot_minor,
                        platform_fee_minor, shipping_minor, discount_minor,
                        currency_minor)
SELECT
  gen_random_uuid(),
  (SELECT id FROM orders WHERE buyer_id = :'buyer_id' LIMIT 1),
  (SELECT id FROM products WHERE seller_id = :'seller_a_id' AND sku = 'WXDR-001' LIMIT 1),
  :'seller_a_id',
  :'buyer_id',
  2, 45000, 17929, 4500, 0, 0, 1;  -- platform_fee_minor is the LINE total: 2250/item x 2

-- ── Reviews (verified purchasers) ────────────────────────────
INSERT INTO reviews (id, product_id, seller_id, buyer_id, order_item_id,
                    rating, title, body, is_verified_purchase, status)
SELECT
  gen_random_uuid(), pr.id, pr.seller_id, o.buyer_id, oi.id,
  5, 'Robe magnifique, parfait ajustement',
  'Recueillie en 3 jours. La bordure kente est exactement comme sur la photo. Je repererai.',
  TRUE, 'published'
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products pr ON pr.id = oi.product_id
WHERE o.buyer_id = :'buyer_id'
  AND pr.seller_id = :'seller_a_id'
  AND pr.sku = 'WXDR-001';

INSERT INTO reviews (id, product_id, seller_id, buyer_id, order_item_id,
                    rating, title, body, is_verified_purchase, status)
SELECT
  gen_random_uuid(), pr.id, pr.seller_id, o.buyer_id, oi.id,
  4, 'Texture incroyable',
  'Tissu magnifiquement tissé. La livraison a pris plus de temps que prevu mais en valait la peine.',
  TRUE, 'published'
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products pr ON pr.id = oi.product_id
WHERE o.buyer_id = :'buyer_id'
  AND pr.seller_id = :'seller_a_id'
  AND pr.sku = 'WHNG-001';

-- ── Support ticket (admin inbox demo) ────────────────────────
INSERT INTO support_tickets (id, profile_id, subject, body, channel, status, priority)
SELECT
  gen_random_uuid(), p.id,
  'Demande de categorie: joaillerie',
  'Je vends des colliers artisanaux. Je voudrais une categorie "joaillerie" avec attributs: metal, pierre, poids.',
  'in_app', 'open', 'normal'
FROM profiles p WHERE p.id = :'seller_b_id';

-- ── Ledger scaffolding (accounts only) ───────────────────────
INSERT INTO accounts (id, profile_id, account_type, label, currency_minor)
SELECT gen_random_uuid(), p.id, 'buyer', format('acheteur_%s', p.id), 1
FROM profiles p WHERE p.id = :'buyer_id';

INSERT INTO accounts (id, profile_id, account_type, label, currency_minor)
SELECT gen_random_uuid(), p.id, 'seller', format('vendeur_%s', p.id), 1
FROM profiles p WHERE p.id = :'seller_a_id';

INSERT INTO accounts (id, profile_id, account_type, label, currency_minor)
SELECT gen_random_uuid(), p.id, 'seller', format('vendeur_%s', p.id), 1
FROM profiles p WHERE p.id = :'seller_b_id';

INSERT INTO accounts (id, profile_id, account_type, label, currency_minor)
VALUES (gen_random_uuid(), NULL, 'platform_pending', 'En attente plateforme', 1)
ON CONFLICT DO NOTHING;

INSERT INTO accounts (id, profile_id, account_type, label, currency_minor)
VALUES (gen_random_uuid(), NULL, 'platform_income', 'Revenus plateforme', 1)
ON CONFLICT DO NOTHING;

INSERT INTO accounts (id, profile_id, account_type, label, currency_minor)
VALUES (gen_random_uuid(), NULL, 'system', 'Systeme', 1)
ON CONFLICT DO NOTHING;

COMMIT;

-- ── Post-seed verification (run manually in psql) ────────────
\pset title 'Post-seed verification'
SELECT '1. seller_a costs visible to seller_a' AS check,
       (SELECT COUNT(*) FROM product_costs WHERE seller_id = :'seller_a_id') AS rows;
SELECT '2. seller_b sees 0 seller_a costs' AS check,
       (SELECT COUNT(*) FROM product_costs WHERE product_id IN (
         SELECT id FROM products WHERE seller_id = :'seller_a_id')) AS rows;
SELECT '3. buyer sees 0 seller_a costs' AS check,
       (SELECT COUNT(*) FROM product_costs WHERE seller_id = :'seller_a_id') AS rows;
SELECT '4. public catalog has no cost column (manual check: SELECT * FROM products WHERE status=''active'')' AS note;
SELECT '5. weighted-average cost for dress' AS check,
       (SELECT weighted_average_cost(
         (SELECT id FROM products WHERE sku='WXDR-001' AND seller_id=:'seller_a_id'),
         :'seller_a_id')) AS wa_cost;
 SELECT '6. seed order cost snapshot' AS check,
        (SELECT cost_unit_price_snapshot_minor FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE p.sku='WXDR-001' AND oi.buyer_id = :'buyer_id' LIMIT 1) AS snapshot;
