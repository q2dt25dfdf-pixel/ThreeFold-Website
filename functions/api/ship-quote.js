// POST /api/ship-quote
// Body: { items:[{slug,size,qty}], address, ship_code? }
// Quotes live USPS rates for the cart via HQ's /api/internal/ship-rates (the ONE
// implementation of the weight table + USPS filter — no EasyPost key or weight
// constants live in this repo). Responses:
//   { free: true, reason }                        — VIP3 / $100+; picker skipped
//   { complete: false }                           — address not complete yet
//   { shipment_id, weight_oz, rates: [...] }      — signed rates, cheapest first
//   { fallback: true, shipping_cents, service }   — flat $5.95 on ANY rate failure
// The rate path never blocks checkout: HQ down, EasyPost down, bad address,
// missing secret — all degrade to the flat fallback with a loud server log.
import { json, validateCart, cleanAddress, addressComplete, computeShipping, FLAT_SHIP_CENTS } from "./_lib.js";

function flatFallback() {
  return { fallback: true, shipping_cents: FLAT_SHIP_CENTS, service: "Standard Shipping" };
}

export async function onRequestPost(context) {
  const env = context.env || {};
  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Malformed request." }, 400); }

  let cart;
  try { cart = validateCart(body.items); } catch (e) { return json({ error: e.message }, e.status || 400); }

  // Free shipping (code / threshold) wins outright — no picker, HQ buys cheapest later.
  const ship = computeShipping(cart.items, cart.subtotalCents, body.ship_code, env.SHIP_CODE_VIP3);
  if (ship.free) return json({ free: true, reason: ship.reason });

  const address = cleanAddress(body.address);
  if (!addressComplete(address)) return json({ complete: false });

  const secret = env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error("[ship-quote] INTERNAL_API_SECRET not set — flat fallback");
    return json(flatFallback());
  }
  const base = (env.HQ_BASE_URL || "https://hq.threefoldsupply.com").replace(/\/$/, "");

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 6000);
    const res = await fetch(base + "/api/internal/ship-rates", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.items.map(function (li) { return { name: li.name, size: li.size, qty: li.qty }; }),
        address: address,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const d = await res.json().catch(function () { return {}; });
    if (!res.ok || !Array.isArray(d.rates) || !d.rates.length) {
      console.error("[ship-quote] HQ ship-rates failed (HTTP " + res.status + "): " + (d.error || "no rates") + " — flat fallback");
      return json(flatFallback());
    }
    return json({ shipment_id: d.shipment_id, weight_oz: d.weight_oz, rates: d.rates });
  } catch (e) {
    console.error("[ship-quote] rate path error — flat fallback: " + (e && e.message));
    return json(flatFallback());
  }
}
