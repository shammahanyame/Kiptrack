-- Kiptrack: real category hierarchy for the navigation bar.
--
-- Run this once in the Supabase SQL editor (or with `supabase db push`) after
-- 20261118000000. `parent_id` is optional: top-level categories keep NULL and
-- the catalogue falls back to the config-driven sub-menus when it is absent.

alter table public.categories
  add column if not exists parent_id uuid references public.categories (id) on delete set null;

create index if not exists categories_parent_id_idx
  on public.categories (parent_id);

-- Optional seed: nest the catalogue's children under their parents. Adjust the
-- slugs to match your real data, or leave every row top-level.
-- update public.categories set parent_id = (select id from public.categories where slug = 'electronics')
--   where slug in ('phones', 'audio', 'computers', 'chargers');
