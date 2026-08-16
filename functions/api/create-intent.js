// POST /api/create-intent
// Body: { items:[{slug,size,qty}], address:{name,line1,line2,city,state,postal_code}, email,
//         ship_code?, ship_rate? }
// Validates the cart, computes the tax-inclusive total via Stripe Tax, and creates a
// PaymentIntent (automatic_payment_methods on, receipt_email, shipping, order_items metadata).
// Returns { client_secret, amount } (amount in cents) for the deferred Payment Element.
//
// ship_rate is the customer's selected live USPS rate ({ shipment_id, rate_id,
// postage_cents, expires_at, service, sig }) as signed by HQ's ship-rates endpoint.
// The signature is verified HERE, server-side, before the amount is used — the
// client can never name its own price. Invalid/expired → flat $5.95 fallback, and
// the payment still goes through. Free shipping (code/threshold) overrides any rate.
import { json, validateCart, orderSummary, cleanAddress, addressComplete, taxCalculate, computeShipping, verifySignedRate, FLAT_SHIP_CENTS } from "./_lib.js";

export async function onRequestPost(context) {
  const key = context.env && context.env.STRIPE_SECRET_KEY;
  if (!key) return json({ error: "Checkout not configured (missing STRIPE_SECRET_KEY)." }, 503);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: "Malformed request." }, 400); }

  const email = String(body.email || "").trim();
  if (email.indexOf("@") < 1) return json({ error: "A valid email is required." }, 400);

  let cart;
  try { cart = validateCart(body.items); } catch (e) { return json({ error: e.message }, e.status || 400); }

  const address = cleanAddress(body.address);
  if (!addressComplete(address)) return json({ error: "A complete US shipping address is required." }, 400);
  const name = String((body.address && body.address.name) || "").trim() || "Customer";

  const ship = computeShipping(cart.items, cart.subtotalCents, body.ship_code, context.env && context.env.SHIP_CODE_VIP3);

  // Live-rate path: use the selected rate's amount only if HQ's signature checks out.
  let shipCents = ship.cents;
  let rateMeta = null; // { service, rate_id, shipment_id } once verified
  if (!ship.free && body.ship_rate) {
    const ok = await verifySignedRate(context.env && context.env.INTERNAL_API_SECRET, body.ship_rate);
    if (ok) {
      shipCents = body.ship_rate.postage_cents;
      rateMeta = {
        service: String(body.ship_rate.service || ""),
        rate_id: String(body.ship_rate.rate_id || ""),
        shipment_id: String(body.ship_rate.shipment_id || ""),
      };
    } else {
      // Tampered or expired quote: never fail the payment — charge the flat rate.
      shipCents = FLAT_SHIP_CENTS;
      console.error("[create-intent] ship_rate signature invalid/expired — flat fallback ($5.95)");
    }
  }

  let calc;
  try { calc = await taxCalculate(key, cart.items, address, shipCents); }
  catch (e) { return json({ error: e.message || "Tax calculation failed." }, e.status || 502); }

  const p = new URLSearchParams();
  p.set("amount", String(calc.totalCents));
  p.set("currency", "usd");
  p.set("automatic_payment_methods[enabled]", "true");
  p.set("receipt_email", email);
  p.set("shipping[name]", name);
  p.set("shipping[address][line1]", address.line1);
  if (address.line2) p.set("shipping[address][line2]", address.line2);
  p.set("shipping[address][city]", address.city);
  p.set("shipping[address][state]", address.state);
  p.set("shipping[address][postal_code]", address.postal_code);
  p.set("shipping[address][country]", address.country);
  p.set("metadata[order_items]", orderSummary(cart.items));
  p.set("metadata[tax_calculation]", calc.id);   // for the post-payment Tax Transaction (webhook)
  p.set("metadata[subtotal]", (calc.subtotalCents / 100).toFixed(2));
  p.set("metadata[tax]", (calc.taxCents / 100).toFixed(2));
  p.set("metadata[shipping_cents]", String(shipCents));
  // Boolean only — never store the attempted code text.
  p.set("metadata[ship_code_used]", ship.codeValid ? "true" : "false");
  // Verified live-rate details for HQ's label flow (service name is the durable
  // contract — checkout rate ids are expired by label time). Absent on flat/free.
  if (rateMeta && rateMeta.service) {
    p.set("metadata[ship_service]", rateMeta.service);
    p.set("metadata[ship_rate_id]", rateMeta.rate_id);
    p.set("metadata[ship_shipment_id]", rateMeta.shipment_id);
  }
  // Structured line items for HQ's Shop Orders detail (falls back to parsing order_items if
  // absent/oversized). Stripe metadata values cap at 500 chars — omit if a big cart exceeds it.
  const liJson = JSON.stringify(cart.items.map((li) => ({ name: li.name, size: li.size, qty: li.qty, unit_cents: li.unitCents })));
  if (liJson.length <= 490) p.set("metadata[line_items]", liJson);

  let res, data;
  try {
    res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
      body: p.toString(),
    });
    data = await res.json();
  } catch (e) { return json({ error: "Could not reach Stripe." }, 502); }

  if (!res.ok || !data.client_secret) {
    return json({ error: (data.error && data.error.message) || "Could not start payment." }, 502);
  }
  return json({ client_secret: data.client_secret, amount: calc.totalCents });
}
