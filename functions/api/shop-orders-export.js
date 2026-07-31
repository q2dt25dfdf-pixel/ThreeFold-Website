// Cloudflare Pages Function — GET /api/shop-orders-export?key=<SHOP_EXPORT_TOKEN>
// JOB 4: exports UNSHIPPED shop_orders as a Pirate Ship batch-import CSV.
// Token-gated because it returns customer PII (names + addresses). Flip the `shipped` flag
// manually in HQ/Supabase after a batch is shipped so it drops off this export.
//
// Env: SHOP_EXPORT_TOKEN (required), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

function csvCell(v) {
  var s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Pirate Ship batch import: flexible CSV, columns mapped during import. These headers cover
// recipient + address + a reference/description. Amount is informational (not needed to buy a label).
var HEADERS = ["Order ID", "Recipient Name", "Email", "Street1", "Street2", "City", "State", "Zipcode", "Country", "Items", "Amount"];

export function buildPirateShipCsv(rows) {
  var lines = [HEADERS.join(",")];
  rows.forEach(function (r) {
    var d = (r && r.data) || {};
    var a = d.shipping_address || {};
    lines.push([
      d.payment_intent_id || r.id || "",
      d.customer_name || "",
      d.email || "",
      a.line1 || "", a.line2 || "", a.city || "", a.state || "", a.postal_code || "", a.country || "US",
      d.order_items || "",
      d.amount != null ? d.amount : "",
    ].map(csvCell).join(","));
  });
  return lines.join("\r\n") + "\r\n";
}

export async function onRequestGet(context) {
  const env = context.env || {};
  const provided = new URL(context.request.url).searchParams.get("key");
  if (!env.SHOP_EXPORT_TOKEN || provided !== env.SHOP_EXPORT_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Supabase not configured", { status: 503 });
  }
  const base = env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const res = await fetch(base + "/rest/v1/shop_orders?select=id,data&data->>shipped=eq.false&order=id", {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!res.ok) {
    const t = await res.text().catch(function () { return ""; });
    return new Response("Supabase error " + res.status + " " + t, { status: 502 });
  }
  const rows = await res.json();
  return new Response(buildPirateShipCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pirateship-unshipped.csv"',
      "Cache-Control": "no-store",
    },
  });
}
