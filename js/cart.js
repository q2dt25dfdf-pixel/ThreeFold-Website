// ThreeFold Originals — shared cart (localStorage) + drawer + checkout.
// Included on every page. Injects the cart drawer, keeps the nav count in sync,
// and POSTs the cart to /api/checkout (Cloudflare Pages Function) for a single
// Stripe Checkout Session. Line item = { slug, name, price, size, qty }.
(function () {
  "use strict";
  var KEY = "tf_cart_v1";

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function write(items) { localStorage.setItem(KEY, JSON.stringify(items)); paint(); }
  function clear() { localStorage.removeItem(KEY); paint(); }
  function keyOf(i) { return i.slug + "|" + i.size; }
  function count(items) { return (items || read()).reduce(function (n, i) { return n + i.qty; }, 0); }
  function subtotal(items) { return (items || read()).reduce(function (s, i) { return s + i.price * i.qty; }, 0); }
  function money(n) { return "$" + Number(n).toFixed(0); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  function addItem(item) {
    var items = read(), k = keyOf(item), ex = null;
    for (var i = 0; i < items.length; i++) { if (keyOf(items[i]) === k) { ex = items[i]; break; } }
    if (ex) ex.qty = Math.min(99, ex.qty + item.qty); else items.push(item);
    write(items); openDrawer();
  }
  function setQty(k, q) {
    var items = read();
    for (var i = 0; i < items.length; i++) { if (keyOf(items[i]) === k) { items[i].qty = Math.max(1, Math.min(99, q)); break; } }
    write(items);
  }
  function removeKey(k) { write(read().filter(function (x) { return keyOf(x) !== k; })); }

  // ---- drawer DOM ----
  var drawer, backdrop;
  function ensureDom() {
    if (document.getElementById("tf-cart-drawer")) return;
    backdrop = document.createElement("div");
    backdrop.id = "tf-cart-backdrop"; backdrop.className = "cart-backdrop";
    backdrop.addEventListener("click", closeDrawer);
    drawer = document.createElement("aside");
    drawer.id = "tf-cart-drawer"; drawer.className = "cart-drawer"; drawer.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
  }
  function openDrawer() { ensureDom(); paint(); document.body.classList.add("cart-open"); drawer.setAttribute("aria-hidden", "false"); }
  function closeDrawer() { document.body.classList.remove("cart-open"); if (drawer) drawer.setAttribute("aria-hidden", "true"); }

  function paint() {
    var items = read();
    var badges = document.querySelectorAll("#cartCount");
    for (var b = 0; b < badges.length; b++) {
      badges[b].textContent = count(items);
      badges[b].classList.toggle("has", count(items) > 0);
    }
    if (!drawer) return;
    if (!items.length) {
      drawer.innerHTML =
        '<div class="cart-head"><b>Your Cart</b><button class="cart-x" aria-label="Close cart">×</button></div>' +
        '<div class="cart-empty">Your cart is empty.</div>';
      return;
    }
    var rows = items.map(function (i) {
      var k = keyOf(i);
      return '' +
        '<div class="cart-item" data-k="' + esc(k) + '">' +
          '<div class="ci-main"><b>' + esc(i.name) + '</b><span class="ci-size">Size ' + esc(i.size) + '</span></div>' +
          '<div class="ci-controls">' +
            '<div class="qty"><button class="q-dec" aria-label="decrease quantity">−</button>' +
            '<span class="q-n">' + i.qty + '</span>' +
            '<button class="q-inc" aria-label="increase quantity">+</button></div>' +
            '<span class="ci-price">' + money(i.price * i.qty) + '</span>' +
            '<button class="ci-remove" aria-label="remove item">Remove</button>' +
          '</div>' +
        '</div>';
    }).join("");
    drawer.innerHTML =
      '<div class="cart-head"><b>Your Cart</b><button class="cart-x" aria-label="Close cart">×</button></div>' +
      '<div class="cart-items">' + rows + '</div>' +
      '<div class="cart-foot">' +
        '<div class="cart-sub"><span>Subtotal</span><b>' + money(subtotal(items)) + '</b></div>' +
        '<p class="cart-note">Tax and shipping calculated at checkout.</p>' +
        '<button class="btn cart-checkout" id="cartCheckout">Checkout →</button>' +
        '<p class="cart-err" id="cartErr" style="display:none"></p>' +
      '</div>';
  }

  // Go to the custom checkout page (checkout.html).
  function checkout() {
    if (!read().length) return;
    window.location.href = "checkout.html";
  }

  // Fallback: hosted Stripe Checkout Session via /api/checkout. Kept for reference; not used
  // by the drawer button anymore (custom checkout replaced it).
  async function checkoutHosted() {
    var items = read();
    if (!items.length) return;
    var btn = document.getElementById("cartCheckout");
    var err = document.getElementById("cartErr");
    if (err) err.style.display = "none";
    if (btn) { btn.disabled = true; btn.textContent = "Starting checkout…"; }
    try {
      var res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items.map(function (i) { return { slug: i.slug, size: i.size, qty: i.qty }; })),
      });
      var data = {};
      try { data = await res.json(); } catch (e) {}
      if (!res.ok || !data.url) throw new Error(data.error || ("Checkout failed (" + res.status + ")"));
      window.location.href = data.url;
    } catch (e) {
      if (err) { err.textContent = e.message; err.style.display = "block"; }
      if (btn) { btn.disabled = false; btn.textContent = "Checkout →"; }
    }
  }

  // ---- events (delegated) ----
  document.addEventListener("click", function (e) {
    var addBtn = e.target.closest(".add-btn");
    if (addBtn) {
      var card = addBtn.closest(".pcard");
      var sel = card && card.querySelector(".size-select");
      var size = sel ? sel.value : "";
      if (!size) { if (sel) { sel.classList.add("need"); sel.focus(); } return; }
      if (sel) sel.classList.remove("need");
      addItem({ slug: addBtn.dataset.slug, name: addBtn.dataset.name, price: Number(addBtn.dataset.price), size: size, qty: 1 });
      return;
    }
    if (e.target.closest("#cartBtn")) { openDrawer(); return; }
    if (e.target.closest(".cart-x")) { closeDrawer(); return; }
    if (e.target.closest("#cartCheckout")) { checkout(); return; }
    var itemEl = e.target.closest(".cart-item");
    if (itemEl) {
      var k = itemEl.getAttribute("data-k");
      var cur = read().filter(function (x) { return keyOf(x) === k; })[0];
      if (e.target.closest(".q-inc") && cur) setQty(k, cur.qty + 1);
      else if (e.target.closest(".q-dec") && cur) setQty(k, cur.qty - 1);
      else if (e.target.closest(".ci-remove")) removeKey(k);
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });

  function init() {
    ensureDom();
    // Order confirmation: clear the cart and reveal the banner if present.
    if (/[?&]ordered=1(&|$)/.test(location.search)) {
      clear();
      var banner = document.getElementById("orderedBanner");
      if (banner) banner.style.display = "";
    }
    paint();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
