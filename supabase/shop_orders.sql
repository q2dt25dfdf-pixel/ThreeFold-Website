-- shop_orders — online ThreeFold Originals orders recorded by the Stripe webhook
-- (functions/api/stripe-webhook.js). Follows HQ's table convention: id text PK + data jsonb.
-- Run once in the Supabase SQL editor (same project as HQ). Safe to re-run (idempotent).

-- id = Stripe PaymentIntent id (pi_...). The primary key is the dedupe key: a webhook retry
-- re-inserts the same id and the insert is ignored (resolution=ignore-duplicates), so
-- retries are fully idempotent end to end.
create table if not exists shop_orders (
  id   text  primary key,
  data jsonb not null default '{}'::jsonb
);

-- Enable RLS with NO policies: shop_orders holds customer PII (names + addresses), so the
-- anon/browser key must NOT be able to read it. The service-role key used by the webhook and
-- the CSV export bypasses RLS regardless, so server-side access is unaffected. Server-only.
alter table shop_orders enable row level security;

-- Optional: add to the realtime publication. Note: with RLS enabled and no policies, the
-- anon key receives no rows here (as intended) — server code reads via the service role.
-- Safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shop_orders'
  ) then
    alter publication supabase_realtime add table shop_orders;
  end if;
end $$;

-- Handy index for the Pirate Ship export (unshipped orders).
create index if not exists shop_orders_unshipped_idx on shop_orders ((data->>'shipped'));
