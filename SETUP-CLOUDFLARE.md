# SETUP-CLOUDFLARE — checkout function environment

The cart checkout is a Cloudflare Pages Function at `functions/api/checkout.js`
(served at `/api/checkout`). It creates one Stripe Checkout Session server-side, so it
needs the Stripe **secret** key available as an environment variable in Cloudflare.

The keys are **never** stored in the repo. Add them in the Cloudflare dashboard as
environment variables. You need **two**:
- `STRIPE_SECRET_KEY` (`sk_live_…`) — **encrypted**. Same secret key used for the Product
  Seeder. Used by `/api/checkout`, `/api/tax-quote`, and `/api/create-intent`.
- `STRIPE_PUBLISHABLE_KEY` (`pk_live_…`) — not secret, but add it the same way. Served by
  `/api/config` so the custom checkout page (`checkout.html`) can initialize Stripe.js and
  mount the Payment Element.

## Add STRIPE_SECRET_KEY

1. Cloudflare dashboard → **Workers & Pages** → open the **ThreeFold-Website** Pages project.
2. **Settings → Environment variables** (also called Variables and Secrets).
3. Under **Production**, click **Add variable** and add BOTH:
   - `STRIPE_SECRET_KEY` = your `sk_live_…` key → click **Encrypt** → Save.
   - `STRIPE_PUBLISHABLE_KEY` = your `pk_live_…` key → Save (Encrypt optional).
4. Repeat both under **Preview** so checkout works on branch/preview deploys of
   `feat/site-revamp`.
5. **Redeploy** the project (Deployments → latest → Retry deploy, or push a commit) so
   the function picks up the new variable. Cloudflare injects it as `context.env.STRIPE_SECRET_KEY`.

> Tip: for a live-mode test without real fees, you can temporarily set the **Preview**
> variable to a **test-mode** key (`sk_test_…`) and check out on the preview URL with
> Stripe's test card `4242 4242 4242 4242`. Switch Preview back to the live key before launch.

## Verify

- Open the site (preview or prod), add an item, and click **Checkout →**. You should be
  redirected to a Stripe Checkout page that shows the item(s), collects a US shipping
  address, and adds tax at the address step.
- If you instead see an error like *"Checkout is not configured yet"*, the variable isn't
  set for that environment (Production vs Preview) or the project wasn't redeployed.

## Stripe webhook — order recording + tax transactions (`/api/stripe-webhook`)

`functions/api/stripe-webhook.js` listens for `payment_intent.succeeded`, creates the Stripe
Tax transaction, and records the order into Supabase `shop_orders`. It needs these Cloudflare
env vars (Production **and** Preview), in addition to `STRIPE_SECRET_KEY`:

| Variable | Value | Encrypt |
|----------|-------|---------|
| `STRIPE_WEBHOOK_SECRET` | the endpoint's signing secret, a **`whsec_…`** value (NOT an API key) | yes |
| `SUPABASE_URL` | the HQ Supabase project URL (`https://<ref>.supabase.co`) | no |
| `SUPABASE_SERVICE_ROLE_KEY` | HQ Supabase **service_role** key (same one HQ uses) | yes |
| `SHOP_EXPORT_TOKEN` | any long random string you pick (gates the CSV export) | yes |

### One-time: create the table
Run `supabase/shop_orders.sql` in the Supabase SQL editor (same project as HQ). Creates the
`shop_orders` table (id = PaymentIntent id → dedupe).

### Create the webhook endpoint in Stripe (LIVE mode)
1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. **Endpoint URL** = your site origin + `/api/stripe-webhook`:
   - Production: `https://<your-prod-domain>/api/stripe-webhook`
   - Preview: add a **second** endpoint for the Cloudflare preview URL
     `https://<preview-subdomain>.pages.dev/api/stripe-webhook` (use a test-mode endpoint +
     test keys while testing on preview).
3. **Events to send** → select **only** `payment_intent.succeeded`.
4. Save, then **Reveal** the endpoint's **Signing secret** (`whsec_…`) and paste it into
   Cloudflare as `STRIPE_WEBHOOK_SECRET` (Production for the prod endpoint; Preview for the
   preview endpoint — each endpoint has its own whsec_).
5. In Cloudflare: add all four vars under **Production** and **Preview**, then
   **Deployments → Retry deployment** so the functions pick them up.

## Related

- `functions/api/price-map.js` — committed slug → Stripe **price ID** map (no secrets).
  Regenerate it with the seeder (`node scripts/stripe-seed.mjs`) if you add products; see
  `SETUP-STRIPE.md`.
- The old per-product `PAYMENT_LINKS` map still lives in `shop.html` as an unused fallback.
- `functions/api/shop-orders-export.js` — GET `/api/shop-orders-export?key=<SHOP_EXPORT_TOKEN>`
  returns unshipped orders as a Pirate Ship batch-import CSV. Flip `data.shipped` to `true`
  in Supabase after shipping so the order drops off the export.
