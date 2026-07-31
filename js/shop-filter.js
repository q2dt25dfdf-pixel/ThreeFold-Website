// Shop filter chips + sort (shop.html). Chips show one collection row (or All);
// Sort reorders the product cards within each rail. "Bestsellers" is disabled until we
// have real Stripe sales data (see SWAP-LIST).
(function () {
  "use strict";
  var sections = [].slice.call(document.querySelectorAll("section.coll")).filter(function (s) { return s.querySelector(".rail"); });
  sections.forEach(function (sec) {
    var rail = sec.querySelector(".rail");
    sec.setAttribute("data-key", rail.id.replace("rail-", ""));
    [].slice.call(rail.querySelectorAll(".pcard")).forEach(function (card, i) { card.setAttribute("data-idx", i); });
  });

  var chips = [].slice.call(document.querySelectorAll(".chip"));
  chips.forEach(function (ch) {
    ch.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.remove("active"); });
      ch.classList.add("active");
      var f = ch.getAttribute("data-filter");
      sections.forEach(function (sec) {
        sec.style.display = (f === "all" || sec.getAttribute("data-key") === f) ? "" : "none";
      });
    });
  });

  function cardName(card) { var b = card.querySelector(".add-btn"); return b ? (b.getAttribute("data-name") || "") : ""; }
  var sel = document.getElementById("sortSel");
  if (sel) sel.addEventListener("change", function () {
    var mode = sel.value;
    sections.forEach(function (sec) {
      var rail = sec.querySelector(".rail");
      var cards = [].slice.call(rail.querySelectorAll(".pcard"));
      cards.sort(function (a, b) {
        if (mode === "az") return cardName(a).localeCompare(cardName(b));
        if (mode === "newest") return (+b.getAttribute("data-idx")) - (+a.getAttribute("data-idx"));
        return (+a.getAttribute("data-idx")) - (+b.getAttribute("data-idx")); // featured
      });
      cards.forEach(function (c) { rail.appendChild(c); });
    });
  });
})();
