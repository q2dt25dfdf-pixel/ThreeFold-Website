// Shared helpers for the custom-checkout Pages Functions (not a route — no onRequest export).
// Validates the cart against the committed price map and runs Stripe Tax calculations.
// STRIPE_SECRET_KEY is passed in by callers (from context.env). No secrets live here.

import PRICE_MAP from "./price-map.js";

export const TAX_CODE = "txcd_30011000"; // general clothing
export const CURRENCY = "usd";
export const ALLOWED_SIZES = new Set(["s", "m", "l", "xl", "2xl"]);

export const FLAT_SHIP_CENTS = 595;        // $5.95 flat rate
export const FREE_SHIP_THRESHOLD_CENTS = 10000; // free at $100.00+

// Single source of truth for shipping. Rules in order:
//   1. valid ship code (matches validCode, case-insensitive/trimmed) → free
//   2. subtotal >= $100 → free
//   3. otherwise $5.95
// validCode is the expected code from env (env.SHIP_CODE_VIP3) — kept out of client source.
// Returns { cents, free, reason: 'code'|'threshold'|null, codeValid }.
export function computeShipping(items, subtotalCents, shipCode, validCode) {
  const submitted = String(shipCode || "").trim();
  const codeValid = !!validCode && submitted.toLowerCase() === String(validCode).trim().toLowerCase();
  if (codeValid) return { cents: 0, free: true, reason: "code", codeValid: true };
  if (subtotalCents >= FREE_SHIP_THRESHOLD_CENTS) return { cents: 0, free: true, reason: "threshold", codeValid: false };
  return { cents: FLAT_SHIP_CENTS, free: false, reason: null, codeValid: false };
}

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
    // Per-product unit price from the committed map (regenerated from products.csv by
    // stripe-seed.mjs). FAIL LOUD if absent — a missing price must never become a charge.
    // Client-sent prices are (and stay) ignored.
    const unitCents = entry.unit_cents;
    if (!Number.isInteger(unitCents) || unitCents <= 0) {
      throw { status: 400, message: "No price configured for " + it.slug };
    }
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

// ── Signed live-rate quotes ───────────────────────────────────────────────────
// HQ's /api/internal/ship-rates HMAC-signs every USPS rate it quotes (hex SHA-256
// over shipment_id|rate_id|postage_cents|expires_at|service, keyed with the shared
// INTERNAL_API_SECRET, 30-minute expiry). create-intent verifies here before using
// the amount — a client-supplied price is never trusted. Invalid or expired quotes
// fall back to FLAT_SHIP_CENTS; they never fail the payment.

function hexOf(buf) {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Returns true only for a well-formed, unexpired, correctly signed rate quote.
export async function verifySignedRate(secret, rate) {
  if (!secret || !rate) return false;
  const shipmentId = String(rate.shipment_id || "");
  const rateId = String(rate.rate_id || "");
  const cents = rate.postage_cents;
  const exp = rate.expires_at;
  const service = String(rate.service || "");
  const sig = String(rate.sig || "");
  if (!shipmentId || !rateId || !service || !sig) return false;
  if (!Number.isInteger(cents) || cents <= 0) return false;
  if (!Number.isInteger(exp) || Math.floor(Date.now() / 1000) > exp) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const payload = shipmentId + "|" + rateId + "|" + cents + "|" + exp + "|" + service;
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return constantTimeEqual(hexOf(mac), sig);
}

// Stripe Tax calculation. shippingCents is taxed as shipping (CA taxes shipping on taxable
// goods). Returns { id, subtotalCents, shippingCents, taxCents, totalCents }.
export async function taxCalculate(key, lineItems, address, shippingCents) {
  shippingCents = shippingCents || 0;
  const p = new URLSearchParams();
  p.set("currency", CURRENCY);
  p.set("customer_details[address][country]", address.country);
  p.set("customer_details[address][postal_code]", address.postal_code);
  if (address.state) p.set("customer_details[address][state]", address.state);
  if (address.city) p.set("customer_details[address][city]", address.city);
  if (address.line1) p.set("customer_details[address][line1]", address.line1);
  p.set("customer_details[address_source]", "shipping");
  p.set("shipping_cost[amount]", String(shippingCents));
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
    shippingCents: shippingCents,
    taxCents: typeof data.tax_amount_exclusive === "number" ? data.tax_amount_exclusive : (data.amount_total - subtotal - shippingCents),
    totalCents: data.amount_total,
  };
}
