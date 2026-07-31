# SETUP-CLOUDFLARE — checkout function environment

The cart checkout is a Cloudflare Pages Function at `functions/api/checkout.js`
(served at `/api/checkout`). It creates one Stripe Checkout Session server-side, so it
needs the Stripe **secret** key available as an environment variable in Cloudflare.

The key is **never** stored in the repo. Add it in the Cloudflare dashboard as an
**encrypted** environment variable. Use the **same** secret key you used for the
"Product Seeder" (`STRIPE_SECRET_KEY`, `sk_live_…`).

## Add STRIPE_SECRET_KEY

1. Cloudflare dashboard → **Workers & Pages** → open the **ThreeFold-Website** Pages project.
2. **Settings → Environment variables** (also called Variables and Secrets).
3. Under **Production**, click **Add variable**:
   - **Variable name:** `STRIPE_SECRET_KEY`
   - **Value:** paste your `sk_live_…` key
   - Click **Encrypt** so it's stored as a secret (value hidden after saving).
   - **Save.**
4. Repeat under **Preview** (add the same `STRIPE_SECRET_KEY`, Encrypt, Save) so
   checkout also works on branch/preview deploys of `feat/site-revamp`.
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

## Related

- `functions/api/price-map.js` — committed slug → Stripe **price ID** map (no secrets).
  Regenerate it with the seeder (`node scripts/stripe-seed.mjs`) if you add products; see
  `SETUP-STRIPE.md`.
- The old per-product `PAYMENT_LINKS` map still lives in `shop.html` as an unused fallback.
