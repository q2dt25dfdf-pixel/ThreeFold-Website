// Cloudflare Pages Function — POST /api/stripe-webhook
// Handles Stripe `payment_intent.succeeded` for the custom checkout. All other events → 200.
//
// Order of operations:
//   0. Verify the Stripe-Signature with STRIPE_WEBHOOK_SECRET (Web Crypto). Invalid → 400.
//   JOB 1 (gates 200/500): create the Stripe Tax transaction from metadata.tax_calculation,
//          reference = PaymentIntent id. Attempt-then-classify: a duplicate/already-exists
//          error for that reference is treated as success (no pre-check lookup). Any OTHER
//          tax error → 500 so Stripe retries.
//   JOB 2 (never gates): record the order in Supabase `shop_orders`, keyed on the
//          PaymentIntent id (dedupe via primary key + ignore-duplicates). Supabase failure
//          is logged and we still return 200 — only tax gates 200 vs 500.
//   JOB 3: stub hook for HQ-branded emails (no send yet).
//   JOB 4: see functions/api/shop-orders-export.js (Pirate Ship CSV).
//
// Env (Cloudflare Pages, Prod + Preview): STRIPE_WEBHOOK_SECRET (whsec_), STRIPE_SECRET_KEY,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. See SETUP-CLOUDFLARE.md.

const enc = new TextEncoder();

function toHex(buf) {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
  return s;
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verify Stripe's `t=..,v1=..` signature over `${t}.${rawBody}`. Returns the parsed event
// object if valid, else null. Uses HMAC-SHA256 via Web Crypto (Workers-compatible).
export async function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return null;
  const parts = sigHeader.split(",").map(function (p) { return p.split("="); });
  const t = (parts.find(function (p) { return p[0] === "t"; }) || [])[1];
  const v1s = parts.filter(function (p) { return p[0] === "v1"; }).map(function (p) { return p[1]; });
  if (!t || !v1s.length) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(t + "." + rawBody));
  const expected = toHex(mac);
  if (!v1s.some(function (v) { return timingSafeEqual(expected, v); })) return null;
  try { return JSON.parse(rawBody); } catch (e) { return null; }
}

// Attempt-then-classify: is this Stripe error a "reference already used / duplicate"?
export function isDuplicateTaxError(errObj) {
  var s = JSON.stringify(errObj || "").toLowerCase();
  return /already|exists|duplicate/.test(s);
}

// JOB 1 — create the tax transaction from the calculation.
async function createTaxTransaction(key, calculationId, reference) {
  const p = new URLSearchParams();
  p.set("calculation", calculationId);
  p.set("reference", reference);
  const res = await fetch("https://api.stripe.com/v1/tax/transactions/create_from_calculation", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });
  const data = await res.json().catch(function () { return {}; });
  if (res.ok) return { ok: true };
  return { ok: false, duplicate: isDuplicateTaxError(data.error), message: (data.error && (data.error.message || data.error.code)) || ("HTTP " + res.status) };
}

// Parse structured line items from metadata.line_items (set by create-intent). Returns
// undefined if absent/invalid so HQ falls back to parsing the order_items summary string.
function parseMetaLineItems(raw) {
  if (!raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return undefined;
    const out = arr
      .map((li) => ({
        name: String(li.name || ""),
        size: String(li.size || ""),
        qty: parseInt(li.qty, 10) || 1,
        unit_cents: typeof li.unit_cents === "number" ? li.unit_cents : null,
      }))
      .filter((li) => li.name);
    return out.length ? out : undefined;
  } catch (e) { return undefined; }
}

// Build the shop_orders row from the PaymentIntent (id = PI id → dedupe key).
export function buildOrderRow(pi) {
  const sh = pi.shipping || {};
  const a = sh.address || {};
  const m = pi.metadata || {};
  return {
    id: pi.id,
    data: {
      payment_intent_id: pi.id,
      email: pi.receipt_email || "",
      customer_name: sh.name || "",
      shipping_address: {
        line1: a.line1 || "", line2: a.line2 || "", city: a.city || "",
        state: a.state || "", postal_code: a.postal_code || "", country: a.country || "US",
      },
      order_items: m.order_items || "",
      line_items: parseMetaLineItems(m.line_items), // structured; omitted (undefined) if absent
      amount: typeof pi.amount === "number" ? pi.amount / 100 : null,
      tax_amount: m.tax != null ? Number(m.tax) : null,
      shipping_cents: m.shipping_cents != null ? Number(m.shipping_cents) : null,
      ship_code_used: m.ship_code_used === "true",
      payment_intent: pi.id,
      created_at: pi.created ? new Date(pi.created * 1000).toISOString() : null,
      shipped: false,
    },
  };
}

// JOB 2 — insert into Supabase shop_orders; dedupe on the primary key (PI id).
async function recordShopOrder(env, pi) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[webhook] Supabase env not set; skipping shop_orders for", pi.id);
    return;
  }
  const base = env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const res = await fetch(base + "/rest/v1/shop_orders?on_conflict=id", {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(buildOrderRow(pi)),
  });
  if (!res.ok) {
    const t = await res.text().catch(function () { return ""; });
    throw new Error("supabase " + res.status + " " + t);
  }
}

// JOB 3 — TODO hook: HQ-branded order emails plug in here (customer confirmation + internal
// alert). Intentionally a no-op for now; do NOT send until HQ templates are wired.
async function maybeSendOrderEmails(/* pi, env */) {
  return; // TODO(JOB 3): wire HQ-branded emails here.
}

// Notify HQ so it fires the same bell + web push as "New Lead". Best-effort; never gates 200.
async function notifyHq(env, pi) {
  const secret = env.INTERNAL_API_SECRET;
  if (!secret) { console.warn("[webhook] INTERNAL_API_SECRET not set; skipping HQ notify"); return; }
  const base = (env.HQ_BASE_URL || "https://hq.threefoldsupply.com").replace(/\/$/, "");
  const m = pi.metadata || {};

  let firstItem = "", moreCount = 0;
  const li = parseMetaLineItems(m.line_items);
  if (li && li.length) {
    firstItem = li[0].name; moreCount = li.length - 1;
  } else if (m.order_items) {
    const chunks = String(m.order_items).split(/;|·/).map((s) => s.trim()).filter(Boolean);
    if (chunks.length) {
      firstItem = chunks[0].replace(/\s*\([^)]*\)\s*[x×]\s*\d+\s*$/i, "").trim();
      moreCount = chunks.length - 1;
    }
  }

  const res = await fetch(base + "/api/internal/shop-order-created", {
    method: "POST",
    headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_name: (pi.shipping && pi.shipping.name) || "",
      first_item: firstItem,
      more_count: moreCount,
      total: typeof pi.amount === "number" ? pi.amount / 100 : 0,
      payment_intent_id: pi.id,
    }),
  });
  if (!res.ok) console.error("[webhook] HQ notify failed", res.status);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export async function onRequestPost(context) {
  const env = context.env || {};
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response("Webhook secret not configured", { status: 500 });

  const sig = context.request.headers.get("stripe-signature");
  const rawBody = await context.request.text();
  const event = await verifyStripeSignature(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!event) return new Response("Invalid signature", { status: 400 });

  if (event.type !== "payment_intent.succeeded") return json({ received: true, ignored: event.type });

  const pi = event.data && event.data.object;
  if (!pi || !pi.id) return json({ received: true });

  // JOB 1 — tax transaction (gates 200/500)
  const calcId = pi.metadata && pi.metadata.tax_calculation;
  if (calcId) {
    if (!env.STRIPE_SECRET_KEY) { console.error("[webhook] STRIPE_SECRET_KEY missing for tax tx", pi.id); return new Response("tax key missing", { status: 500 }); }
    const tax = await createTaxTransaction(env.STRIPE_SECRET_KEY, calcId, pi.id);
    if (!tax.ok && !tax.duplicate) {
      console.error("[webhook] tax transaction failed for", pi.id, tax.message);
      return new Response("tax transaction failed", { status: 500 }); // Stripe retries
    }
    console.log("[webhook] tax transaction ok for", pi.id, tax.duplicate ? "(duplicate=ok)" : "");
  } else {
    console.warn("[webhook] no metadata.tax_calculation on", pi.id, "- skipping tax transaction");
  }

  // JOB 2 — record order (never gates)
  try { await recordShopOrder(env, pi); }
  catch (e) { console.error("[webhook] shop_orders insert failed for", pi.id, e && e.message); }

  // Push to HQ (bell + web push), same channel as New Lead. Never gates the 200.
  try { await notifyHq(env, pi); }
  catch (e) { console.error("[webhook] HQ notify error for", pi.id, e && e.message); }

  // JOB 3 — email hook (stub)
  try { await maybeSendOrderEmails(pi, env); }
  catch (e) { console.error("[webhook] email hook error for", pi.id, e && e.message); }

  return json({ received: true });
}

// Non-POST probes.
export async function onRequestGet() { return new Response("Stripe webhook endpoint. POST only.", { status: 405 }); }
