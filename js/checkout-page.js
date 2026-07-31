// Custom checkout (checkout.html). Renders the cart summary, mounts the Stripe Payment
// Element (deferred intent), live-quotes tax when the address is complete, and confirms
// the payment. On success -> order-confirmed.html with the cart cleared.
(function () {
  "use strict";
  var KEY = "tf_cart_v1";
  var catalog = window.TF_CATALOG || {};

  function read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function money(n) { return "$" + Number(n).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function $(id) { return document.getElementById(id); }

  var cart = read();
  if (!cart.length) { location.replace("shop.html"); return; }

  var subtotal = cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  var lastTotalCents = Math.round(subtotal * 100); // elements amount; updated after tax quote

  // ---- render order summary ----
  function initials(name) { return name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); }
  function renderItems() {
    $("co-items").innerHTML = cart.map(function (i) {
      var c = catalog[i.slug] || {};
      var thumb = c.img ? '<img class="co-thumb" src="' + c.img + '" alt="' + esc(i.name) + '">'
                        : '<div class="co-thumb co-thumb-txt">' + esc(initials(i.name)) + '</div>';
      return '<div class="co-item">' + thumb +
        '<div class="co-it-main"><b>' + esc(i.name) + '</b><small>Size ' + esc(i.size) + ' · Qty ' + i.qty + '</small></div>' +
        '<span class="co-amt">' + money(i.price * i.qty) + '</span></div>';
    }).join("");
    $("co-subtotal").textContent = money(subtotal);
    $("co-shipping").textContent = "Free";
    $("co-tax").textContent = "—";
    $("co-total").textContent = money(subtotal);
  }
  renderItems();

  // ---- form + tax ----
  var fields = { email: "co-email", name: "co-name", line1: "co-line1", line2: "co-line2", city: "co-city", state: "co-state", postal_code: "co-zip" };
  function val(k) { var el = $(fields[k]); return el ? el.value.trim() : ""; }
  function address() { return { name: val("name"), line1: val("line1"), line2: val("line2"), city: val("city"), state: val("state"), postal_code: val("postal_code"), country: "US" }; }
  function addressComplete(a) { return !!(a.line1 && a.city && a.state && a.postal_code); }
  function emailValid() { return val("email").indexOf("@") > 0; }

  var quoteTimer, elements, stripe, paymentReady = false, quoting = false, taxKnown = false;

  function setTotals(sub, ship, tax, total) {
    $("co-subtotal").textContent = money(sub);
    $("co-shipping").textContent = ship > 0 ? money(ship) : "Free";
    $("co-tax").textContent = tax == null ? "—" : money(tax);
    $("co-total").textContent = total == null ? money(sub) : money(total);
    if ($("co-pay-amt")) $("co-pay-amt").textContent = total == null ? money(sub) : money(total);
  }

  async function quoteTax() {
    var a = address();
    if (!addressComplete(a)) { taxKnown = false; setTotals(subtotal, 0, null, null); updatePayState(); return; }
    quoting = true; updatePayState();
    try {
      var res = await fetch("/api/tax-quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart.map(cartLine), address: a }) });
      var d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not calculate tax.");
      if (d.complete) {
        taxKnown = true;
        setTotals(d.subtotal, d.shipping, d.tax, d.total);
        lastTotalCents = Math.round(d.total * 100);
        if (elements) elements.update({ amount: lastTotalCents });
      }
    } catch (e) { showError(e.message); }
    finally { quoting = false; updatePayState(); }
  }
  function cartLine(i) { return { slug: i.slug, size: i.size, qty: i.qty }; }

  function debounceQuote() { clearTimeout(quoteTimer); quoteTimer = setTimeout(quoteTax, 500); }

  Object.keys(fields).forEach(function (k) {
    var el = $(fields[k]); if (!el) return;
    el.addEventListener("input", function () { if (k !== "email") debounceQuote(); updatePayState(); });
    el.addEventListener("blur", function () { if (k !== "email") quoteTax(); });
  });

  function showError(msg) { var e = $("co-error"); if (e) { e.textContent = msg; e.style.display = msg ? "block" : "none"; } }
  function updatePayState() {
    var btn = $("co-pay"); if (!btn) return;
    btn.disabled = !(paymentReady && emailValid() && addressComplete(address()) && taxKnown && !quoting);
  }

  // ---- Stripe ----
  async function initStripe() {
    var cfg;
    try { cfg = await (await fetch("/api/config")).json(); } catch (e) { cfg = {}; }
    if (!cfg.publishableKey || !window.Stripe) { showError("Payments are not configured yet. Please try again later."); return; }
    stripe = Stripe(cfg.publishableKey);
    var appearance = { theme: "stripe", variables: { colorPrimary: "#141414", colorText: "#141414", colorBackground: "#ffffff", fontFamily: "Archivo, system-ui, sans-serif", borderRadius: "8px", fontSizeBase: "15px" } };
    elements = stripe.elements({ mode: "payment", amount: lastTotalCents, currency: "usd", appearance: appearance });
    var pe = elements.create("payment", { layout: "tabs" });
    pe.mount("#payment-element");
    pe.on("ready", function () { paymentReady = true; updatePayState(); });
  }
  initStripe();

  // ---- pay ----
  $("co-pay").addEventListener("click", async function () {
    showError("");
    var a = address();
    if (!emailValid()) { showError("Enter a valid email."); return; }
    if (!addressComplete(a)) { showError("Enter your full shipping address."); return; }
    var btn = $("co-pay"); btn.disabled = true; var label = btn.textContent; btn.textContent = "Processing…";
    try {
      var sub = await elements.submit();
      if (sub.error) throw new Error(sub.error.message);
      var res = await fetch("/api/create-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: cart.map(cartLine), address: a, email: val("email") }) });
      var d = await res.json();
      if (!res.ok || !d.client_secret) throw new Error(d.error || "Could not start payment.");
      // Snapshot the order BEFORE confirm so order-confirmed.html can render it even on redirect.
      localStorage.setItem("tf_last_order", JSON.stringify({ items: cart, total: (d.amount / 100) }));
      var result = await stripe.confirmPayment({
        elements: elements,
        clientSecret: d.client_secret,
        confirmParams: { return_url: location.origin + "/order-confirmed.html", receipt_email: val("email") },
        redirect: "if_required",
      });
      if (result.error) { throw new Error(result.error.message); }
      // No redirect needed (e.g. card) -> success.
      localStorage.removeItem(KEY);
      location.href = "order-confirmed.html";
    } catch (e) {
      showError(e.message || "Payment failed. Please try again.");
      btn.disabled = false; btn.textContent = label;
    }
  });

  updatePayState();
})();
