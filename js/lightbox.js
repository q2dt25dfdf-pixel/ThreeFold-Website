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
    overlay.querySelector(".lb-inner").innerHTML =
      '<button class="lb-x" aria-label="Close">×</button>' +
      '<img class="lb-img" src="' + img.getAttribute("src") + '" alt="' + esc(name) + '">' +
      '<div class="pcard lb-card">' +
        '<div class="lb-meta"><b>' + esc(name) + '</b><span>· $' + esc(price) + '</span></div>' +
        '<div class="lb-buy">' +
          '<select class="size-select" aria-label="Size — ' + esc(name) + '"><option value="">Size</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>2XL</option></select>' +
          '<button class="btn add-btn" type="button" data-slug="' + esc(slug) + '" data-name="' + esc(name) + '" data-price="' + esc(price) + '">Add to Cart</button>' +
        '</div>' +
      '</div>';
    overlay.querySelector(".lb-x").addEventListener("click", close);
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
