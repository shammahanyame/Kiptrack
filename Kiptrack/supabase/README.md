# Supabase setup

The app talks to Supabase with the public anon key. Two things live here:

1. `migrations/20261118000000_orders_and_reviews.sql` — the `orders`,
   `order_items` and `reviews` tables plus their row-level security policies.
2. `migrations/20261118000001_order_cancellation.sql` — lets a buyer cancel
   their own order while it is still placed or confirmed.
3. The existing catalogue tables (`products`, `categories`,
   `category_translations`) and the `product-images` storage bucket.
4. `migrations/20261118000002_category_hierarchy.sql` — adds an optional
   `parent_id` column so the category bar can render real subcategories.

## Applying the migration

Either paste the SQL file into **Supabase → SQL Editor → New query → Run**, or
use the CLI from the repository root:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Run the files once, in filename order. The first creates types, so re-running it
as-is errors on `create type public.order_status`.

## What the policies allow

| Table | Buyer | Seller | Anonymous |
| --- | --- | --- | --- |
| `orders` | read/create their own | read/update orders containing their items | none |
| `order_items` | read/create items on their own order | read their own sold items | none |
| `reviews` | read/create/edit/delete their own | read all | read all |

Seller visibility for `orders` goes through `public.is_order_seller(uuid)`, a
`security definer` helper, so the `orders` and `order_items` policies do not
recurse into each other.

## App environment

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Without them the app still renders, but sign-in, publishing and checkout show a
"not configured" message instead of calling the network.
