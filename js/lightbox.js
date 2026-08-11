// Product image lightbox (shop.html). Clicking a product image opens a fullscreen overlay
// with the large image plus name / price / Size select / Add to Cart. Closes via X, backdrop
// click, or Esc. Add to Cart reuses cart.js: the overlay's controls live inside a `.pcard`
// wrapper, so cart.js's existing delegated handler validates size, adds the item, updates the
// nav count, and opens the drawer — no cart.js changes needed here.
(function () {
  "use strict";
  var overlay;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function build() {
    overlay = document.createElement("div");
    overlay.id = "tf-lightbox";
    overlay.className = "lightbox";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '<div class="lb-backdrop"></div><div class="lb-inner" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(overlay);
    overlay.querySelector(".lb-backdrop").addEventListener("click", close);
    // .lb-inner covers the backdrop, so also close when the empty area around the
    // image/card is clicked (image, card, and their children are not the inner itself).
    var inner = overlay.querySelector(".lb-inner");
    inner.addEventListener("click", function (e) { if (e.target === inner) close(); });
  }

  function open(card) {
    if (!overlay) build();
    var img = card.querySelector(".pmedia img");
    var addBtn = card.querySelector(".add-btn");
    if (!img || !addBtn) return;
    var name = addBtn.dataset.name, price = addBtn.dataset.price, slug = addBtn.dataset.slug;
    // Use what the browser ACTUALLY loaded for the grid (the cached WebP via <picture>),
    // not the src attribute (the PNG fallback) — avoids a 1MB+ cold fetch on first tap.
    var src = img.currentSrc || img.getAttribute("src");
    // Reserve the image box BEFORE the image arrives: aspect-ratio from the grid image's
    // dimensions (natural if loaded, else its width/height attributes), plus a width using
    // the same contain-fit math as the .lb-img CSS caps (92vw / 100vh-140px). Pre-load and
    // post-load boxes are then identical, so the modal never jumps. No dims → no reservation.
    var w = img.naturalWidth || parseInt(img.getAttribute("width"), 10) || 0;
    var h = img.naturalHeight || parseInt(img.getAttribute("height"), 10) || 0;
    var sizeStyle = (w > 0 && h > 0)
      ? ' style="aspect-ratio:' + w + ' / ' + h + ';width:min(92vw,calc((100vh - 140px)*' + (w / h).toFixed(4) + '))"'
      : '';
    overlay.querySelector(".lb-inner").innerHTML =
      '<button class="lb-x" aria-label="Close">×</button>' +
      '<img class="lb-img"' + sizeStyle + ' src="' + src + '" alt="' + esc(name) + '">' +
      '<div class="pcard lb-card">' +
        '<div class="lb-meta"><b>' + esc(name) + '</b><span>· $' + esc(price) + '</span></div>' +
        '<div class="lb-buy">' +
          '<select class="size-select" aria-label="Size — ' + esc(name) + '"><option value="">Size</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>2XL</option></select>' +
          '<button class="btn add-btn" type="button" data-slug="' + esc(slug) + '" data-name="' + esc(name) + '" data-price="' + esc(price) + '">Add to Cart</button>' +
        '</div>' +
      '</div>';
    overlay.querySelector(".lb-x").addEventListener("click", close);

    // High-res swap: the small cached image is already showing with its box reserved
    // (aspect-ratio + width on .lb-img). Load the native-res sibling (<name>@lg.webp)
    // behind it and swap src when ready — same aspect, so no layout shift. If it fails
    // to load, the small image simply stays. Grid loading is untouched (still the 900px
    // WebP); these large files are only fetched here, on open.
    var lbImg = overlay.querySelector(".lb-img");
    if (lbImg && /\.(webp|png)$/i.test(src)) {
      var largeSrc = src.replace(/\.(webp|png)$/i, "@lg.webp");
      if (largeSrc !== src) {
        var hi = new Image();
        hi.onload = function () { lbImg.src = largeSrc; };
        hi.src = largeSrc; // onerror: no-op — keep the small image
      }
    }

    document.body.classList.add("lb-open");
    overlay.setAttribute("aria-hidden", "false");
  }
  function close() { if (overlay) { document.body.classList.remove("lb-open"); overlay.setAttribute("aria-hidden", "true"); } }

  document.addEventListener("click", function (e) {
    var im = e.target.closest(".pmedia img");
    if (im && im.closest(".pcard")) { open(im.closest(".pcard")); return; }
    // After a successful add from the lightbox (size chosen), close it so the cart drawer shows.
    var add = e.target.closest("#tf-lightbox .add-btn");
    if (add) {
      var sel = overlay && overlay.querySelector(".lb-card .size-select");
      if (sel && sel.value) setTimeout(close, 0);
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
})();
