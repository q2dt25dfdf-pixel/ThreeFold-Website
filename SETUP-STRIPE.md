# SETUP-STRIPE — checkout, tax & shipping for ThreeFold Originals

The shop (`shop.html`) sells originals via **Stripe Payment Links** — one link per product.
Each product's Buy button reads its URL from the `PAYMENT_LINKS` map at the top of
`shop.html`. This checklist gets those links live, with tax and shipping handled correctly.

Do the steps in order. Nothing on the shop actually charges until the `TODO` values in
`PAYMENT_LINKS` are replaced with real Payment Link URLs.

---

## 1. Stripe account basics
- [ ] Log in to the **Stripe Dashboard** with the ThreeFold Supply Co. business account.
- [ ] Confirm the business profile (legal name, address, support email) is complete.
- [ ] Set the **statement descriptor** so charges show as ThreeFold on card statements.

## 2. Enable Stripe Tax
- [ ] Go to **Stripe Dashboard → Tax** and enable **Stripe Tax**.
- [ ] Set the **origin address** (where you ship from) — your Bay Area location.
- [ ] Add your **California tax registration**: register for a **CDTFA seller's permit**
      (California Department of Tax and Fee Administration) and enter the registration in
      **Tax → Registrations** so CA sales tax is collected.
- [ ] Set product **tax category** to apparel/clothing (or the default taxable goods
      category) so Stripe applies the right rate.
- [ ] Add registrations for any other state where you cross an economic-nexus threshold
      later (not needed at launch if you only have CA nexus).

## 3. Create one Payment Link per product
For **each** product in the shop (16 total — see the list at the bottom), create a Payment
Link in **Stripe Dashboard → Payment Links → + New**:
- [ ] **Product name** = the product name from the shop (match it so orders are readable).
- [ ] **Price** = **$35.00 USD** (one-time).
- [ ] **Let customers adjust quantity** → **ON**.
- [ ] **Collect customers' addresses → Shipping address** → **ON** (US; add others if you ship there).
- [ ] **Collect tax automatically (Stripe Tax)** → **ON**.
- [ ] (Optional) Add the product image and a short description.
- [ ] Save, then **copy the resulting URL** (looks like `https://buy.stripe.com/xxxxxxxx`).

## 4. Paste the URLs into the site
- [ ] Open `shop.html` and find the `PAYMENT_LINKS` map near the top.
- [ ] Replace each `"TODO"` with the matching product's Payment Link URL (keys are already
      labeled with the product name and price in a comment).
- [ ] Save. Each Buy button will now open that product's Stripe checkout in a new tab.
      (Buttons whose value is still `TODO` show "Link coming soon" and do not charge.)

## 5. Order notifications
- [ ] **Stripe Dashboard → Settings → Notifications**: turn on **email for successful
      payments / new orders** so you're alerted on every sale.
- [ ] Confirm the notification email is one you check (business inbox).

## 6. Fulfillment — Pirate Ship label workflow
For each paid order:
1. [ ] Open the order/payment in the **Stripe Dashboard** (or the notification email).
2. [ ] **Copy the customer's shipping address** from the Stripe order.
3. [ ] Go to **pirateship.com**, create a new shipment, and **paste the shipping address**.
4. [ ] Buy the **USPS label** (e.g., Ground Advantage / First-Class for tees), print it.
5. [ ] Pack the item, apply the label, and drop off / schedule pickup.
6. [ ] (Optional) Mark the order fulfilled and send the customer the tracking number.

## 7. Go-live check
- [ ] Do a **test purchase** on one live Payment Link (real card, small item) and confirm:
      tax is added at checkout, shipping address is collected, and you get the order email.
- [ ] Refund the test charge in Stripe if desired.
- [ ] Confirm **no `TODO` values remain** in `PAYMENT_LINKS`:
      ```bash
      grep -n '"TODO"' shop.html   # must return nothing at launch
      ```

---

## Product list (16 — all $35)

**Bay Area:** San Francisco Tee · San Francisco Tee — Camo · San Jose Tee ·
San Jose Tee — Camo · San Francisco Bridge · San Francisco City · San Jose — Red
**Aloha:** Hawaii Map · Surfboard
**3 Ball:** 3 Ball — Camo · 3 Ball — Fire · 3 Ball — Pink Camo · 3 Ball — Waves · 3 Ball — Black & White
**Chrollo:** Chrollo — Full Back · Chrollo — Chain

> Product names are provisional (from design filenames) pending final naming. If you rename
> a product, keep the Stripe Payment Link name and the shop card in sync.
