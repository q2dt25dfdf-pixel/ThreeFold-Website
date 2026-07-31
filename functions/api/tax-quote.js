// POST /api/tax-quote
// Body: { items:[{slug,size,qty}], address:{line1,city,state,postal_code} }
// Validates the cart, runs a Stripe Tax calculation for the address, and returns dollar
// amounts (no percentages). Used to refresh totals live as the address is completed.
import { json, validateCart, cleanAddress, addressComplete, taxCalculate } from "./_lib.js";

export async function onRequestPost(context) {
  const key = context.env && context.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Checkout not configured (missing STRIPE_SECRET_KEY)." }, 503);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Malformed request." }, 400); }

  let cart;
  try { cart = validateCart(body.items); } catch (e) { return json({ error: e.message }, e.status || 400); }

  const address = cleanAddress(body.address);
  if (!addressComplete(address)) {
    // Not enough address yet — return subtotal only so the UI can show it.
    return json({
      complete: false,
      subtotal: cart.subtotalCents / 100,
      shipping: 0,
      tax: null,
      total: null,
    });
  }

  let calc;
  try { calc = await taxCalculate(key, cart.items, address); }
  catch (e) { return json({ error: e.message || "Tax calculation failed." }, e.status || 502); }

  return json({
    complete: true,
    subtotal: calc.subtotalCents / 100,
    shipping: calc.shippingCents / 100,
    tax: calc.taxCents / 100,
    total: calc.totalCents / 100,
  });
}
