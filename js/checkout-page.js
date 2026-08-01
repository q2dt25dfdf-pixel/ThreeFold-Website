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
    $("co-shipping").textContent = "—";
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
  var shipCode = ""; // applied ship code (validated server-side; never hard-coded here)

  function cartLine(i) { return { slug: i.slug, size: i.size, qty: i.qty }; }

  function setShipMsg(free, reason, subtotalDollars) {
    var hint = $("co-freeship-hint"); if (!hint) return;
    if (free) {
      hint.style.display = "";
      hint.textContent = reason === "code" ? "Free shipping — code applied." : "Free shipping on orders $100+.";
    } else {
      var remain = Math.max(0, 100 - subtotalDollars);
      if (remain > 0) { hint.style.display = ""; hint.textContent = "Add " + money(remain) + " more for free shipping."; }
      else { hint.style.display = "none"; }
    }
  }
  function setCodeMsg(applied, valid) {
    var msg = $("co-code-msg"); if (!msg) return;
    if (!applied) { msg.style.display = "none"; return; }
    msg.style.display = "";
    msg.textContent = valid ? "Code applied." : "Code not recognized.";
    msg.className = "co-code-msg " + (valid ? "ok" : "bad");
  }

  // d = tax-quote response: { subtotal, shipping, shipping_free, shipping_reason, tax, total, complete }
  function setTotals(d) {
    $("co-subtotal").textContent = money(d.subtotal);
    $("co-shipping").textContent = d.shipping_free ? "Free" : money(d.shipping);
    $("co-tax").textContent = d.tax == null ? "—" : money(d.tax);
    var shown = d.total == null ? (d.subtotal + d.shipping) : d.total;
    $("co-total").textContent = money(shown);
    if ($("co-pay-amt")) $("co-pay-amt").textContent = money(shown);
    setShipMsg(d.shipping_free, d.shipping_reason, d.subtotal);
  }

  async function quoteTax() {
    quoting = true; updatePayState();
    try {
      var res = await fetch("/api/tax-quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart.map(cartLine), address: address(), ship_code: shipCode }),
      });
      var d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not calculate totals.");
      taxKnown = !!d.complete;
      setTotals(d);
      setCodeMsg(d.code_applied, d.code_valid);
      lastTotalCents = Math.round((d.total != null ? d.total : (d.subtotal + d.shipping)) * 100);
      if (elements) elements.update({ amount: lastTotalCents });
    } catch (e) { showError(e.message); }
    finally { quoting = false; updatePayState(); }
  }

  function debounceQuote() { clearTimeout(quoteTimer); quoteTimer = setTimeout(quoteTax, 500); }

  Object.keys(fields).forEach(function (k) {
    var el = $(fields[k]); if (!el) return;
    el.addEventListener("input", function () { if (k !== "email") debounceQuote(); updatePayState(); });
    el.addEventListener("blur", function () { if (k !== "email") quoteTax(); });
  });

  // "Have a code?" toggle + apply → re-quote (shipping AND tax recompute server-side).
  var codeToggle = $("co-code-toggle"), codeRow = $("co-code-row"), codeApply = $("co-code-apply"), codeInput = $("co-code-input");
  if (codeToggle && codeRow) codeToggle.addEventListener("click", function () {
    codeRow.style.display = codeRow.style.display === "none" ? "flex" : "none";
    if (codeInput && codeRow.style.display !== "none") codeInput.focus();
  });
  function applyCode() { shipCode = codeInput ? codeInput.value.trim() : ""; quoteTax(); }
  if (codeApply) codeApply.addEventListener("click", applyCode);
  if (codeInput) codeInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyCode(); } });

  function showError(msg) { var e = $("co-error"); if (e) { e.textContent = msg; e.style.display = msg ? "block" : "none"; } }
  function updatePayState() {
    var btn = $("co-pay"); if (!btn) return;
    btn.disabled = !(paymentReady && emailValid() && addressComplete(address()) && taxKnown && !quoting);
  }
  quoteTax(); // initial: show shipping (flat/free/threshold) even before the address is entered

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
