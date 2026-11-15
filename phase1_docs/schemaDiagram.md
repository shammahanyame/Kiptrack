# Phase 1 — Schema, RLS, and cost-engine overview

## ER diagram (entity relationships)

```
profiles 1 ──┬── 1..* products ── 1..* product_costs (owner only)
             │     │                     │
             │     │                     └── 1..* inventory_batches (owner only)
             │     │
             │     └── 1..* order_items (snapshot) ← 1 orders
             │            │                               │
             │            └── seller_id → profiles        │
             │            └── buyer_id  → profiles        │
             │                                            │
             ├── 1..* reviews (verified purchasers)      │
             ├── 1..* wishlist_items                     │
             ├── 1..* addresses                          │
             ├── 1..* budget_settings                    │
             ├── 1..* buyer_spending (denormalized)      │
             ├── 1..* payouts                            │
             ├── 1..* accounts (ledger) ── 1..* ledger_entries
             ├── 1..* notifications
             └── 1..* chat_messages (via orders)

categories 1 ──┬── 1..* category_translations (en, fr)
               └── 1..* products orders 1 ── 1..* order_items ── 1 products (snapshot)
                 │
                 ├─ buyer_order_items_view  (buyer read, no cost col)
                 └─ seller_order_items_view (seller read, with cost col)

 audits: audit_log tracks price_change, cost_change
 alerts: product_alerts tracks below_cost, low_stock, out_of_stock
```

## Cost privacy boundary (the critical design — three layers)

### Layer 1: RLS blocks direct reads on `order_items`

```
┌─────────────────────────────────────────────────────────────┐
│  PUBLIC (anyone, anon, buyer, other sellers)               │
│                                                             │
│   products          ← title, selling_price, stock, images  │
│   categories        ← name, description (localized)        │
│   public_product_catalog (view)                            │
│                                                             │
│   ❌ product_costs       — RLS blocks, 0 rows for non-owner│
│   ❌ inventory_batches   — RLS blocks, 0 rows for non-owner│
│   ❌ order_items         — RLS blocks ALL direct reads     │
│       (no SELECT policy for buyers/sellers; admin only)    │
└─────────────────────────────────────────────────────────────┘
```

### Layer 2: Buyer reads via `buyer_order_items_view` (NO cost column)

```
┌─────────────────────────────────────────────────────────────┐
│  BUYER (auth.uid = buyer_id)                              │
│                                                             │
│   buyer_order_items_view                                   │
│     ↑ SELECT id, order_id, product_id, seller_id,         │
│       buyer_id, qty, sale_unit_price_minor,               │
│       platform_fee_minor, shipping_minor, discount_minor,  │
│       currency_minor, created_at, updated_at              │
│     ↑ DOES NOT include cost_unit_price_snapshot_minor     │
│     ↑ RLS: auth.uid() = buyer_id                         │
│                                                             │
│   ❌ seller_order_items_view (cost column exists, but     │
│      RLS blocks non-owner reads)                          │
│   ❌ seller_order_item_report() (raises if not owner)     │
└─────────────────────────────────────────────────────────────┘
```

### Layer 3: Seller reads via `seller_order_items_view` + RPC (cost included)

```
┌─────────────────────────────────────────────────────────────┐
│  SELLER OWNER (auth.uid = product.seller_id)              │
│                                                             │
│   product_costs        ← read/write own                    │
│   inventory_batches    ← read/write own                    │
│   seller_order_items_view ← all columns, owner-only RLS   │
│   seller_order_item_report() ← per-sale cost + profit     │
│     ↑ SECURITY DEFINER, checks auth.uid() = p_seller_id   │
│   weighted_average_cost()  ← cost basis helper            │
│   seller_daily_profit      ← roll-up (owner read)         │
│   product_alerts         ← below_cost, low_stock           │
└─────────────────────────────────────────────────────────────┘
```

### Why the buyer does NOT see `cost_unit_price_snapshot_minor`

The seed order stores `cost_unit_price_snapshot_minor = 17929` on the order item. The buyer owns the order, so they might expect to see this column. But:

- The `order_items` table has RLS blocking all direct reads (Layer 1).
- The `buyer_order_items_view` does NOT include the cost column in its SELECT list (Layer 2).
- The buyer's mobile app queries the view, never the table, so the cost column is physically absent from the result set.

The seller sees the cost via `seller_order_items_view` (which includes the column) or `seller_order_item_report()` (which includes it in the return table). Both enforce `auth.uid() = seller_id`.

The guarantee is not just RLS. It's also discipline: no RPC, no Edge Function, no client query ever includes a cost column in a public context. The test suite (`test_cost_privacy.sql`) proves the RLS + view part; the code review proves the discipline part.

## Cost basis

| Method | Formula | Concurrency note |
|---|---|---|
| weighted_average (default) | `SUM(qty*unit_cost)/SUM(qty)` across batches, rounded | Stable under concurrency; recomputed from all batches at snapshot time |
| fifo | earliest remaining batch's unit_cost | True FIFO needs batch reservation; MVP returns earliest batch cost, may be slightly stale under concurrent sales — flagged for Phase 5 |

## Profit (server-side, frozen at sale)

```
profit_minor =
  (sale_unit_price_minor − cost_unit_price_snapshot_minor) × qty
  − platform_fee_minor
  − shipping_minor (seller-borne)
  − discount_minor

margin_pct = profit_minor ÷ (sale_unit_price_minor × qty) × 100
```

- `cost_unit_price_snapshot_minor` is written once at sale time by `create_order()` via `get_current_cost_for_product()`.
- Price edits to `products.selling_price_minor` after the sale do NOT touch `order_items`.
- Refunds reverse profit via reversal rows (Phase 5); the seed doesn't exercise refunds yet.
- `seller_daily_profit` roll-up is maintained by a trigger on `order_items` for fast "today/week/month" dashboard totals; custom ranges aggregate the report view directly.

## Seed cost snapshot verification

Dress (seller_a):
- batch A: 8 @ 17,500 = 140,000
- batch B: 6 @ 18,500 = 111,000
- total: 14 units, 251,000 XAF
- weighted average = 251,000 / 14 = 17,928.57 → **17,929 XAF**
- sale: 2 × 45,000 = 90,000
- platform fee: 5% × 90,000 = 4,500 (2,250 per item)
- profit = (45,000 − 17,929) × 2 − 4,500 = 54,142 − 4,500 = **49,642 XAF**
- margin = 49,642 / 90,000 × 100 = **55.16%**

The RLS test asserts `cost_unit_price_snapshot_minor = 17929` and `profit_minor = 49642` on the seed order.

## Alert rules

- **below_cost:** when `selling_price_minor < current_cost_minor` (weighted-average or FIFO current cost). Fires on product price update and on new inventory batch. Stored in `product_alerts`, seller-only visible.
- **low_stock:** when `stock_qty <= low_stock_threshold` and was above before.
- **out_of_stock:** when `stock_qty = 0` and was > 0.

## Design system inputs (captured for the UI phases)

These come from the brand sheet (`kiptrack-brand-sheet.png`) and the fjord UI image (`fjord-HxjSLytTW28s9W8t8KNqtFEeUBzMw5.avif`), and will be formalized in the web admin panel's style guide in Phase 9. Captured now so the UI phases don't invent a different palette.

### Brand palette (exact)

| Token | Hex | Use |
|---|---|---|
| `--color-ink` | `#121316` | Primary text, dark surfaces, app icon background |
| `--color-clay` | `#C08A5A` | Accent: "track" in wordmark, dots, CTAs, highlights |
| `--color-paper` | `#FFFFFF` | Light surfaces, app icon light variant |
| `--color-pearl` | `#F3F3F1` | Off-white backgrounds, cards on light mode |

### Logo assets

- **Wordmark:** `kiptrack` — `kip` in `--color-ink`, `track` in `--color-clay`.
- **Mark:** stylized "K" with a clay dot at top-right. Used as app icon in dark (`#121316` bg, white K + clay dot), light (white bg, ink K + clay dot), and wood (`#C08A5A` bg, white K + ink dot) variants.
- **Lockups:** horizontal, reversed (on dark), stacked, wordmark-only, favicon, avatar.

### UI direction (from fjord image)

The fjord image is the visual benchmark for the app's UI. I'm reading it as: generous whitespace, a warm earth-tone accent against deep ink, soft card surfaces, clear typographic hierarchy, restrained motion. Exact layout details are committed to the web admin style guide; the mobile app mirrors the same tokens.

### Typography (to be finalized in Phase 2/3 with the web panel)

The brand sheet uses a clean sans-serif. I'll propose a pairing once we have the web admin shell: a grotesque for UI (e.g., a Inter-style system font stack for speed) and a serif for display in marketing surfaces if the fjord image supports it. Final choice waits on closer reading of the fjord image, which I'll do in Phase 3 when we build the catalog UI. No typography decision is blocking Phase 1.

### Accessibility (Front-End Design Checklist §1.2, §1.6)

- Clay-on-ink and ink-on-paper contrasts will be checked against WCAG AA before the catalog ships.
- All interactive states (default, hover, focus, active, disabled) will be defined in the style guide, per the checklist.
- Focus rings will be visible; we don't use `outline: none` without a replacement.

### Responsive (checklist §1.7)

- Mobile-first breakpoints: `360px`, `768px`, `1024px`, `1280px`.
- The mobile app (Flutter) and the web admin panel share the same design tokens so the brand is consistent across surfaces.

## File manifest (Phase 1)

```
supabase/
├── migrations/
│   ├── 001_initial_schema.sql        ← tables, RLS, indexes, trigger stubs
│   └── 002_functions_and_triggers.sql ← function + trigger bodies
├── seed/
│   └── seed_data.sql                 ← deterministic seed (2 sellers, buyer, order)
├── rlc_tests/
│   └── test_cost_privacy.sql         ← RLS privacy proof suite
└── README.md

phase1_docs/
└── schemaDiagram.md                  ← this file
```

## Checklist against the Front-End Design Checklist (for the UI handoff later)

- [ ] Grid system defined (checklist §1.1) — will be in the web admin style guide.
- [ ] Colors named and exported (§1.2) — brand palette above; will export as CSS variables + Flutter `Color` constants.
- [ ] Fonts and fallback stacks specified (§1.3) — pending typography decision.
- [ ] Links/nav states defined (§1.4) — pending.
- [ ] Icons in SVG, named `icon-*` (§1.5) — pending; the "K" mark will be an SVG.
- [ ] Forms: states, errors, required indicators, primary/secondary buttons (§1.6) — pending.
- [ ] Responsive breakpoints provided (§1.7) — mobile-first, above.
- [ ] Style guide / component approach (§1.8) — Atomic Design; pending.
- [ ] 404/500 pages designed (§1.9) — pending.
- [ ] Popups/alerts designed (§1.9) — pending (budget warning, price-drop alert, dispute flow).

These are tracked here so we don't silently drop them in the UI phases.
