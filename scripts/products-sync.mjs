// Push the product catalog to HQ (Supabase `products` table via HQ's internal API),
// so HQ's Blank-Mapping picker always lists the live shop catalog and can't drift.
//
//   node scripts/products-sync.mjs                      # DRY RUN: print what would be sent, POST nothing
//   INTERNAL_API_SECRET='...' node scripts/products-sync.mjs --push   # send to HQ (authoritative replace)
//
// SOURCE OF TRUTH: scripts/products.csv (columns: slug,name,collection,price_usd).
// Only slug,name,collection are sent — price lives in Stripe / price-map.js, not HQ.
//
// The HQ endpoint (/api/internal/products-sync) is authoritative: it upserts every row
// and DELETES products whose slug is no longer in the CSV. Run this after editing the CSV
// (the same "regenerate" moment as scripts/stripe-seed.mjs).
//
// SECURITY: reads INTERNAL_API_SECRET from the environment only — never hard-code it,
// never write it to a file. HQ base URL from HQ_BASE_URL (defaults to production).

import { readFileSync, existsSync } from "node:fs";

const CSV_FILE = "scripts/products.csv";
const HQ_BASE = (process.env.HQ_BASE_URL || "https://hq.threefoldsupply.com").replace(/\/$/, "");
const ENDPOINT = HQ_BASE + "/api/internal/products-sync";
const doPush = process.argv.includes("--push");

function parseCsv(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const cells = []; let cur = "", q = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (q) { if (c === '"' && raw[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur); rows.push(cells.map((s) => s.trim()));
  }
  const header = rows.shift();
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

if (!existsSync(CSV_FILE)) { console.error(`ERROR: ${CSV_FILE} not found.`); process.exit(1); }
const seen = new Set();
const products = parseCsv(readFileSync(CSV_FILE, "utf8")).map((r, idx) => {
  if (!r.slug) { console.error(`ERROR: row ${idx + 2} has no slug.`); process.exit(1); }
  if (!r.name) { console.error(`ERROR: row ${idx + 2} (${r.slug}) has no name.`); process.exit(1); }
  if (seen.has(r.slug)) { console.error(`ERROR: duplicate slug "${r.slug}".`); process.exit(1); }
  seen.add(r.slug);
  return { slug: r.slug, name: r.name, collection: r.collection || "" };
});

console.log(`\n${doPush ? "PUSH" : "DRY RUN"} — ${products.length} products from ${CSV_FILE} → ${ENDPOINT}`);
for (const p of products) console.log(`  ${p.slug.padEnd(28)} ${p.name.padEnd(30)} ${p.collection}`);

if (!doPush) {
  console.log(`\nDry run — nothing sent. Re-run with --push (INTERNAL_API_SECRET set) to sync.\n`);
  process.exit(0);
}

const secret = process.env.INTERNAL_API_SECRET;
if (!secret) { console.error("\nERROR: --push requires INTERNAL_API_SECRET. Nothing sent.\n"); process.exit(1); }

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
  body: JSON.stringify({ products }),
});
const text = await res.text();
let json; try { json = JSON.parse(text); } catch { json = null; }

if (!res.ok || !json?.ok) {
  console.error(`\n✗ HQ sync failed (${res.status}): ${json?.error || text}\n`);
  process.exit(1);
}
console.log(`\n✅ Synced. upserted=${json.upserted} deleted=${json.deleted}\n`);
