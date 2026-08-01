// Cloudflare Pages Function — POST /api/checkout
//
// Body: JSON array of cart items: [{ slug, size, qty }, ...]
// Validates each slug against the committed slug -> Stripe price ID map (price-map.js),
// then creates ONE Stripe Checkout Session (mode=payment, automatic_tax on, US shipping
// address collection) and returns { url } for the client to redirect to.
//
// STRIPE_SECRET_KEY comes from the Cloudflare environment (context.env) — never the repo.
// See SETUP-CLOUDFLARE.md to add it (Production + Preview).

import PRICE_MAP from "./price-map.js";

const ALLOWED_SIZES = new Set(["s", "m", "l", "xl", "2xl"]);

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Pure, testable: validate items + build the x-www-form-urlencoded body for Stripe.
// Throws { status, message } on invalid input. `origin` is the site origin for URLs.
export function buildCheckoutForm(items, priceMap, origin) {
  if (!Array.isArray(items) || items.length === 0) {
    throw { status: 400, message: "Your cart is empty." };
  }
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("automatic_tax[enabled]", "true");
  params.set("shipping_address_collection[allowed_countries][0]", "US");
  params.set("success_url", origin + "/shop.html?ordered=1");
  params.set("cancel_url", origin + "/shop.html");

  const summary = [];
  items.forEach((it, i) => {
    const entry = it && priceMap[it.slug];
    if (!entry || !entry.price) {
      throw { status: 400, message: "Unknown or unconfigured product: " + (it && it.slug) };
    }
    const size = String(it.size || "").toLowerCase();
    if (!ALLOWED_SIZES.has(size)) {
      throw { status: 400, message: "Invalid size for " + it.slug };
    }
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    params.set(`line_items[${i}][price]`, entry.price);
    params.set(`line_items[${i}][quantity]`, String(qty));
    summary.push(`${entry.name} (${size.toUpperCase()}) x${qty}`);
  });
  // Human-readable order contents (incl. sizes, which aren't Stripe line-item variants).
  params.set("metadata[order_items]", summary.join("; ").slice(0, 499));
  return params;
}

export async function onRequestPost(context) {
  const key = context.env && context.env.STRIPE_SECRET_KEY;
  if (!key) {
    return json({ error: "Checkout is not configured yet (missing STRIPE_SECRET_KEY)." }, 503);
  }

  let items;
  try { items = await context.request.json(); }
  catch (e) { return json({ error: "Malformed request body." }, 400); }

  let form;
  try { form = buildCheckoutForm(items, PRICE_MAP, new URL(context.request.url).origin); }
  catch (e) { return json({ error: e.message || "Invalid cart." }, e.status || 400); }

  let res, data;
  try {
    res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    data = await res.json();
  } catch (e) {
    return json({ error: "Could not reach Stripe. Please try again." }, 502);
  }

  if (!res.ok || !data || !data.url) {
    const msg = (data && data.error && data.error.message) || "Stripe could not create the checkout session.";
    return json({ error: msg }, 502);
  }
  return json({ url: data.url });
}

// Optional: friendly response for non-POST probes.
export async function onRequestGet() {
  return json({ error: "POST a cart array to this endpoint." }, 405);
}
