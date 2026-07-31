# SWAP-LIST — images & placeholders waiting on final assets

This site references **original full-resolution files in `images/`** (no compressed copies,
no embedded data URIs). To update a photo, **overwrite the file in place, keeping the exact
same filename** — the HTML does not need to be touched.

> **Rule:** swapping an image never requires editing HTML *unless the filename changes*.
> If a filename changes, update the matching `src="..."` in the page listed beside it
> (paths in the HTML are URL-encoded, e.g. a space becomes `%20`).

---

## 1. Hero (approved, may be upgraded)

| Slot | Overwrite this file | Used on |
|------|--------------------|---------|
| Main hero photo | `images/hero-main.png` | `index.html` (also the OpenGraph/social preview image on every page) |

Keep it high-resolution and roughly 1717×916 (the hero box is `aspect-ratio:1717/916`,
`object-position:right center`, blended into the page on the left edge).

---

## 2. Shop product photos — ThreeFold Originals collections (`shop.html`)

`shop.html` is now horizontally-scrolling collection rows. Product photos live in
per-collection subfolders under `images/work/Threefold (Our Work)/`. Re-shoots from Hannah
drop straight onto these paths (keep the exact filename, incl. any trailing space, and the
HTML needs no edit). **Product names below are PROVISIONAL (from filenames) — pending
Alliyah's rename.**

**Bay Area** (`images/work/Threefold (Our Work)/Bay Area/`) — row leads with the four SF/SJ tees:
| Card (provisional) | File |
|--------------------|------|
| San Francisco Tee | `SF FONT .png` *(trailing space before `.png`)* |
| San Francisco Tee — Camo | `SF FONT (CAMO) .png` *(trailing space before `.png`)* |
| San Jose Tee | `SJ FONT.png` |
| San Jose Tee — Camo | `SJ FONT (CAMO) .png` *(trailing space before `.png`)* |
| San Francisco Bridge | `San Francisco Bridge.png` |
| San Francisco City | `SAN FRANCISCO CITY.png` |
| San Jose — Red | `SJ ( RED ).png` |

**Aloha** (`images/work/Threefold (Our Work)/Aloha/`): `Hawaii Map.png`, `SURFBOARD_.png`
**3 Ball** (`images/work/Threefold (Our Work)/3 Ball/`): `3 BALL CAMO_.png`, `3 BALL FIRE - DESIGN.png`, `3 BALL PINK CAMO.png`, `3 BALL WAVES.png`, `3 BALL W_B.png`
**Chrollo** (`images/work/Threefold (Our Work)/Chrollo/`): `Chrollo full back Design.png`, `Chrollo_Chain Design.png`

> The Bay Area `SF FONT (CAMO) .png` is also reused as the "ThreeFold Originals" teaser
> image in the split banner on `index.html`. Overwriting it updates both places.

### Shop prices — SET to $35

All 16 product cards are priced at **$35** (all treated as shirts). No `$—` placeholders
remain on `shop.html`. If any item is **not** a shirt and needs a different price, tell
Claude — flag candidates are "Hawaii Map", "Surfboard", "Chrollo — Full Back",
"Chrollo — Chain" (all currently assumed to be tee designs at $35).

### 🚫 LAUNCH BLOCKER — Stripe Payment Links not yet pasted

Each Buy button reads its checkout URL from the `PAYMENT_LINKS` map at the top of
`shop.html`; every entry is currently `"TODO"`, so no button charges yet. Follow
**`SETUP-STRIPE.md`** to create one Payment Link per product ($35, quantity on, shipping
address on, Stripe Tax on) and paste the URLs. Confirm none remain:

```bash
grep -c '"TODO"' shop.html   # must be 0 at launch (currently 16)
```

### 🚫 LAUNCH BLOCKER — Complete the Stripe setup checklist

Work through **`SETUP-STRIPE.md`**: enable Stripe Tax, add the CA CDTFA seller's-permit
registration, turn on new-order email notifications, and confirm the Pirate Ship label
workflow. Do one test purchase before launch.

### 🚫 LAUNCH BLOCKER — "Get Notified" posts real leads to HQ

The shop banner "Get Notified" button now posts live to
`https://hq.threefoldsupply.com/api/public-lead` with `lead_source: "drop-signup"`
(same endpoint as the Start form). Any submission — including from the staging/preview URL —
creates a **real lead** in Threefold HQ (name/company come in as "Drop Signup"; filter by
`lead_source = drop-signup`). Send one test signup at launch to confirm it lands.

---

## 3. Client collection photos (`clients.html` + client cards on `index.html`)

Each client folder holds a **logo** (card face) and one or more **design directions**
(shown in the case-study popup). Drop new client photos into the matching
`images/work/<CLIENT>/` folder. If you keep the same filenames, nothing else to do.

| Client (case) | Card logo | Design-direction slots (case popup) |
|---------------|-----------|--------------------------------------|
| **DSF7** | `images/work/DSF7/Logo.png` | `images/work/DSF7/DESIGN 1 .png` |
| **POPS** | `images/work/POPS/Logo.png` | `images/work/POPS/Design 1.png`, `images/work/POPS/PIRANHA OPS - DESIGN 2 .png`, `images/work/POPS/PIRANHA OPS - DESIGN 3 .png` |
| **DUR3** | `images/work/DUR3/Logo.png` | `images/work/DUR3/DUR3 - DESIGN 1.png`, `images/work/DUR3/DUR3 - DESIGN 2.png` |
| **Echo of Christ Ministries** | `images/work/Echo of Christ Ministries/Logo.png` | — (none yet — card shows a "Collection in production" tag, no case popup) |

**Client card faces on the Home page** reuse these same files:
- POPS card → `images/work/POPS/Design 1.png`
- DSF7 card → `images/work/DSF7/DESIGN 1 .png`
- DUR3 card → `images/work/DUR3/DUR3 - DESIGN 1.png`

> **If a client filename changes** (or you add/remove a design direction), edit the matching
> `src="..."` inside `clients.html` (and `index.html` for the three Home cards above).
> Adding a new direction = add another `<div class="imgbox"><img src="..."></div>` inside that
> client's `<div class="work-detail" id="case-...">` block.

### Echo of Christ Ministries — pending assets

- [ ] Replace `images/work/ECHO OF CHRIST/Logo.png` with official client-provided logo
      (current file is a screenshot extraction). *(Saved on this branch at
      `images/work/Echo of Christ Ministries/Logo.png`.)*
- [ ] Add Echo of Christ design photos + case popup when collection is produced.
      Until then the card on `clients.html` is non-clickable and shows a
      "Collection in production" tag.

---

## 4. Non-image pre-launch TODOs (not asset swaps, but track them)

### 🚫 LAUNCH BLOCKER — Policy pages need owner review
`privacy.html`, `refunds.html`, and `terms.html` are **DRAFTS** (each starts with an
`<!-- DRAFT: requires owner review before launch -->` comment). Have the owner (and ideally
a lawyer) review the content, set the "Last updated" date, and confirm the CA LLC details,
contact email, and refund windows before launch.

### 🚫 LAUNCH BLOCKER — Stripe checkout + tax
See the two Stripe blockers in section 2 and the full checklist in **`SETUP-STRIPE.md`**
(paste Payment Link URLs; enable Stripe Tax + CA registration; order notifications).

### 🚫 LAUNCH BLOCKER — Echo of Christ logo
Replace the TEMP screenshot logo with the official client-provided logo (see section 3).

### 🚫 LAUNCH BLOCKER — Form → CRM live test
Both the **Start form** and the shop **"Get Notified"** button post live to
`https://hq.threefoldsupply.com/api/public-lead` and create **real leads** in Threefold HQ.
Send one test submission of each at launch to confirm they land (Get Notified is tagged
`lead_source: "drop-signup"`).

_Done:_ ~~Get Notified was a mock `alert()`~~ → now wired to HQ lead capture.
~~Orphaned `start-project.html`~~ → deleted on this branch.
