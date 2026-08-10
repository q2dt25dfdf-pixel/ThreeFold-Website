// Push the product catalog to HQ (Supabase `products` table via HQ's internal API),
// so HQ's Blank-Mapping picker and the redesigned order emails always track the live shop.
//
//   node scripts/products-sync.mjs                      # DRY RUN: build thumbs, print plan, POST nothing
//   INTERNAL_API_SECRET='...' node scripts/products-sync.mjs --push   # send to HQ (authoritative replace)
//
// SOURCE OF TRUTH: scripts/products.csv (columns: slug,name,collection,price_usd) for the
// catalog; shop.html for each product's mockup image. Only slug,name,collection,image are
// sent — price lives in Stripe / price-map.js, not HQ.
//
// THUMBNAILS: the shop mockups are two-up (front+back) on black and don't read small. This
// crops the BACK-PRINT half and writes a 192px (2× of 96px display) square to
// images/email/thumbs/<slug>.png — committed, so Cloudflare Pages serves it. Generated here
// (macOS `sips`) so the space / trailing-space source filenames are normalized ONCE. Run
// after editing the CSV or swapping a mockup, then commit the regenerated thumbs.
//
// SECURITY: reads INTERNAL_API_SECRET from the environment only — never hard-code it,
// never write it to a file. HQ base URL from HQ_BASE_URL (defaults to production).

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CSV_FILE = "scripts/products.csv";
const SHOP_HTML = "shop.html";
const THUMB_DIR = "images/email/thumbs";
const SITE_BASE = "https://threefoldsupply.com";
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

// slug -> source mockup path, paired from shop.html (each product card has an <img src>
// PNG followed by its add-to-cart button carrying data-slug).
function parseShopImages(html) {
  const map = {};
  const re = /<img[^>]+src="([^"]+\.png)"|data-slug="([^"]+)"/gi;
  let m, lastImg = null;
  while ((m = re.exec(html))) {
    if (m[1]) lastImg = m[1];
    else if (m[2] && lastImg) map[m[2]] = decodeURIComponent(lastImg);
  }
  return map;
}

function sips(args) { execFileSync("sips", args, { stdio: ["ignore", "ignore", "ignore"] }); }
function dims(path) {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], { encoding: "utf8" });
  const w = Number((out.match(/pixelWidth:\s*(\d+)/) || [])[1]);
  const h = Number((out.match(/pixelHeight:\s*(\d+)/) || [])[1]);
  return { w, h };
}

// Crop the back-print (right half), center-square it, downscale to 192px. Writes dest.
function makeThumb(srcPath, destPath) {
  execFileSync("cp", [srcPath, destPath]);
  const { w, h } = dims(destPath);
  if (!w || !h) throw new Error(`could not read dimensions of ${srcPath}`);
  const half = Math.floor(w / 2);
  sips(["-c", String(h), String(half), "--cropOffset", "0", String(half), destPath]); // right half
  const side = Math.min(half, h);
  sips(["-c", String(side), String(side), destPath]);                                  // center square
  sips(["-Z", "192", destPath]);                                                        // 2× of 96 display
}

function hasSips() { try { execFileSync("sips", ["--help"], { stdio: "ignore" }); return true; } catch { return false; } }

// ── load catalog + images ──
if (!existsSync(CSV_FILE)) { console.error(`ERROR: ${CSV_FILE} not found.`); process.exit(1); }
if (!existsSync(SHOP_HTML)) { console.error(`ERROR: ${SHOP_HTML} not found.`); process.exit(1); }
if (!hasSips()) { console.error("ERROR: `sips` not found (macOS image tool). Run this on a Mac."); process.exit(1); }

const shopImages = parseShopImages(readFileSync(SHOP_HTML, "utf8"));
mkdirSync(THUMB_DIR, { recursive: true });

const seen = new Set();
const products = parseCsv(readFileSync(CSV_FILE, "utf8")).map((r, idx) => {
  if (!r.slug) { console.error(`ERROR: row ${idx + 2} has no slug.`); process.exit(1); }
  if (!r.name) { console.error(`ERROR: row ${idx + 2} (${r.slug}) has no name.`); process.exit(1); }
  if (seen.has(r.slug)) { console.error(`ERROR: duplicate slug "${r.slug}".`); process.exit(1); }
  seen.add(r.slug);
  return { slug: r.slug, name: r.name, collection: r.collection || "", image: "" };
});

console.log(`\n${doPush ? "PUSH" : "DRY RUN"} — ${products.length} products from ${CSV_FILE} → ${ENDPOINT}`);
let thumbed = 0, missing = 0;
for (const p of products) {
  const src = shopImages[p.slug];
  const destRel = `${THUMB_DIR}/${p.slug}.png`;
  let status;
  if (src && existsSync(src)) {
    try { makeThumb(src, destRel); p.image = `${SITE_BASE}/${destRel}`; thumbed++; status = "thumb ✓"; }
    catch (err) { missing++; status = `thumb FAIL (${err.message})`; }
  } else {
    missing++; status = src ? "src missing on disk" : "no image in shop.html";
  }
  console.log(`  ${p.slug.padEnd(26)} ${p.name.padEnd(28)} ${status}`);
}
console.log(`\nthumbnails: ${thumbed} generated → ${THUMB_DIR}/  ·  ${missing} without image`);

if (!doPush) {
  console.log(`\nDry run — nothing sent. Review/commit the thumbs, then re-run with --push (INTERNAL_API_SECRET set).\n`);
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
