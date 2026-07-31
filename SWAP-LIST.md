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

## 2. Shop product photos — ThreeFold Originals "Day One" (`shop.html`)

Re-shoots from Hannah drop straight onto these paths:

| Product card | Overwrite this file |
|--------------|--------------------|
| San Francisco Tee | `images/work/Threefold (Our Work)/SF FONT .png`  *(note trailing space before `.png`)* |
| San Francisco Tee — Camo | `images/work/Threefold (Our Work)/SF FONT (CAMO).png` |
| San Jose Tee | `images/work/Threefold (Our Work)/SJ FONT.png` |
| San Jose Tee — Camo | `images/work/Threefold (Our Work)/SJ FONT (CAMO).png` |

> `SF FONT (CAMO).png` is also reused as the "ThreeFold Originals" teaser image in the
> split banner on `index.html`. Overwriting it updates both places.

### Shop prices — PLACEHOLDERS

All four shop cards show a `$—` placeholder price. **Grep before launch:**

```bash
grep -n '\$—' shop.html
```

Replace each `<span class="price">$—</span>` with the real price.
(These `$—` are intentional per the work order and are the only remaining placeholders in copy.)

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

- [ ] **Shop "Get Notified" button** (`shop.html`) still shows a mock `alert()` — it has no
      email-capture backend yet. Wire it up or hide it before launch.
- [ ] **Old page `start-project.html`** (previous dark-theme design) is now orphaned/unlinked.
      Recommend deleting it before launch so it isn't deployed.
- [ ] **Start form → CRM:** the form posts live to `https://hq.threefoldsupply.com/api/public-lead`.
      Any submission from the staging/preview URL creates a **real lead** in Threefold HQ.
      Send one test submission at launch to confirm it lands.
