// POST /api/tax-quote
// Body: { items:[{slug,size,qty}], address:{line1,city,state,postal_code}, ship_code?,
//         ship_rate_cents? }
// Computes shipping (flat / free-threshold / valid code) and, when the address is complete,
// runs a Stripe Tax calculation WITH shipping included. Returns dollar amounts (no %).
// Never echoes the submitted code text.
// ship_rate_cents: the customer's selected live USPS rate — DISPLAY-ONLY totals; the
// charge amount is set by create-intent, which verifies the rate's HMAC signature.
// Free shipping (code/threshold) always overrides it.
import { json, validateCart, cleanAddress, addressComplete, taxCalculate, computeShipping } from "./_lib.js";

export async function onRequestPost(context) {
  const key = context.env && context.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Checkout not configured (missing STRIPE_SECRET_KEY)." }, 503);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Malformed request." }, 400); }

  let cart;
  try { cart = validateCart(body.items); } catch (e) { return json({ error: e.message }, e.status || 400); }

  const ship = computeShipping(cart.items, cart.subtotalCents, body.ship_code, context.env && context.env.SHIP_CODE_VIP3);
  let shipCents = ship.cents;
  const override = body.ship_rate_cents;
  if (!ship.free && Number.isInteger(override) && override > 0 && override <= 50000) {
    shipCents = override;
  }
  const codeAttempted = !!String(body.ship_code || "").trim();
  const shipInfo = {
    shipping: shipCents / 100,
    shipping_free: ship.free,
    shipping_reason: ship.reason,          // 'code' | 'threshold' | null
    code_applied: codeAttempted,
    code_valid: ship.codeValid,
    subtotal: cart.subtotalCents / 100,
    free_threshold: 100,
  };

  const address = cleanAddress(body.address);
  if (!addressComplete(address)) {
    return json(Object.assign({ complete: false, tax: null, total: null }, shipInfo));
  }

  let calc;
  try { calc = await taxCalculate(key, cart.items, address, shipCents); }
  catch (e) { return json({ error: e.message || "Tax calculation failed." }, e.status || 502); }

  return json(Object.assign({ complete: true, tax: calc.taxCents / 100, total: calc.totalCents / 100 }, shipInfo));
}
