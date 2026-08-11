// Generate native-resolution WebP siblings (<name>@lg.webp) for the shop product
// images, for the lightbox high-res swap. The grid keeps loading the small 900px WebP;
// these larger files are fetched ONLY when a product is opened in the lightbox.
//
//   node scripts/make-hires.mjs          # regenerate all @lg.webp (idempotent)
//
// Source = each product's full-res PNG (1402–1448px). Output = same pixels, WebP q80,
// named by stripping the source extension and appending "@lg.webp" so it matches the
// lightbox's URL derivation (currentSrc.replace(/(\.webp|\.png)$/, '@lg.webp')).

import { readFileSync, existsSync, statSync } from "node:fs";
import sharp from "sharp";

const SHOP = "shop.html";
const QUALITY = 80;

const html = readFileSync(SHOP, "utf8");
// Product mockups: <img src="images/work/...png"> inside the grid cards.
const pngs = new Set();
const re = /<img[^>]+src="([^"]+\.png)"/gi;
let m;
while ((m = re.exec(html))) {
  const p = decodeURIComponent(m[1]);
  if (p.startsWith("images/work/")) pngs.add(p);
}

const sources = [...pngs];
console.log(`\nGenerating @lg.webp for ${sources.length} product images (native res, q${QUALITY})…\n`);

let made = 0, bytes = 0, failed = 0;
for (const png of sources) {
  const out = png.replace(/\.png$/i, "@lg.webp");
  if (!existsSync(png)) { console.error(`  ✗ missing source: ${png}`); failed++; continue; }
  try {
    await sharp(png).webp({ quality: QUALITY }).toFile(out); // no resize → native resolution
    const sz = statSync(out).size;
    bytes += sz; made++;
    console.log(`  ✓ ${out.split("/").pop().padEnd(34)} ${(sz / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.error(`  ✗ ${png}: ${err.message}`); failed++;
  }
}
console.log(`\nDone. ${made} written, ${(bytes / 1024 / 1024).toFixed(2)} MB total${failed ? `, ${failed} failed` : ""}.\n`);
process.exit(failed ? 1 : 0);
