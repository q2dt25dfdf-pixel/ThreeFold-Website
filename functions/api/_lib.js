// Shared helpers for the custom-checkout Pages Functions (not a route — no onRequest export).
// Validates the cart against the committed price map and runs Stripe Tax calculations.
// STRIPE_SECRET_KEY is passed in by callers (from context.env). No secrets live here.

import PRICE_MAP from "./price-map.js";

export const TAX_CODE = "txcd_30011000"; // general clothing
export const CURRENCY = "usd";
export const ALLOWED_SIZES = new Set(["s", "m", "l", "xl", "2xl"]);
// Match the hosted Payment Links, which set no shipping rate → free shipping.
export const SHIPPING_CENTS = 0;

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Validate [{slug,size,qty}] against the price map + populated Stripe price IDs.
// Returns { items:[{slug,name,size,qty,unitCents,amountCents}], subtotalCents } or throws {status,message}.
export function validateCart(items) {
  if (!Array.isArray(items) || items.length === 0) throw { status: 400, message: "Your cart is empty." };
  const out = []; let subtotal = 0;
  items.forEach((it) => {
    const entry = it && PRICE_MAP[it.slug];
    if (!entry || !entry.price) throw { status: 400, message: "Unavailable product: " + (it && it.slug) };
    const size = String(it.size || "").toLowerCase();
    if (!ALLOWED_SIZES.has(size)) throw { status: 400, message: "Invalid size for " + it.slug };
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    // $35 flat for all current products; price is defined per the CSV/seeder ($35).
    const unitCents = 3500;
    const amountCents = unitCents * qty;
    subtotal += amountCents;
    out.push({ slug: it.slug, name: entry.name, size, qty, unitCents, amountCents, priceId: entry.price });
  });
  return { items: out, subtotalCents: subtotal };
}

export function orderSummary(items) {
  return items.map((i) => `${i.name} (${i.size.toUpperCase()}) x${i.qty}`).join("; ").slice(0, 499);
}

export function cleanAddress(a) {
  a = a || {};
  const s = (v) => String(v || "").trim();
  return {
    line1: s(a.line1), line2: s(a.line2), city: s(a.city),
    state: s(a.state).toUpperCase(), postal_code: s(a.postal_code), country: "US",
  };
}
export function addressComplete(a) {
  return !!(a.line1 && a.city && a.state && a.postal_code && a.country);
}

// Stripe Tax calculation. Returns { id, subtotalCents, shippingCents, taxCents, totalCents }.
export async function taxCalculate(key, lineItems, address) {
  const p = new URLSearchParams();
  p.set("currency", CURRENCY);
  p.set("customer_details[address][country]", address.country);
  p.set("customer_details[address][postal_code]", address.postal_code);
  if (address.state) p.set("customer_details[address][state]", address.state);
  if (address.city) p.set("customer_details[address][city]", address.city);
  if (address.line1) p.set("customer_details[address][line1]", address.line1);
  p.set("customer_details[address_source]", "shipping");
  p.set("shipping_cost[amount]", String(SHIPPING_CENTS));
  lineItems.forEach((li, i) => {
    p.set(`line_items[${i}][amount]`, String(li.amountCents));
    p.set(`line_items[${i}][reference]`, li.slug + "-" + li.size);
    p.set(`line_items[${i}][quantity]`, String(li.qty));
    p.set(`line_items[${i}][tax_code]`, TAX_CODE);
  });
  const res = await fetch("https://api.stripe.com/v1/tax/calculations", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  const data = await res.json();
  if (!res.ok) throw { status: 502, message: (data.error && data.error.message) || "Tax calculation failed." };
  const subtotal = lineItems.reduce((s, li) => s + li.amountCents, 0);
  return {
    id: data.id,
    subtotalCents: subtotal,
    shippingCents: SHIPPING_CENTS,
    taxCents: typeof data.tax_amount_exclusive === "number" ? data.tax_amount_exclusive : (data.amount_total - subtotal - SHIPPING_CENTS),
    totalCents: data.amount_total,
  };
}
