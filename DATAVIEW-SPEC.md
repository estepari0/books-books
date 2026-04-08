# DataView — Specification Audit & Reset

**Date:** March 18, 2026
**Status:** Stuck in iteration loop. This document exists to break the cycle.

---

## What happened

Seven iterations of DataView have been built and rejected. The pattern: each version changed too many variables at once (axis, color, scale, shape, background, layout algorithm) without locking previous decisions. Every rejection triggered a full rewrite instead of a targeted fix. That's on me, not you.

---

## The actual data (constraints that don't change)

- **~198 books** fetched live from Notion
- **13 genres**: Fiction, Science Fiction, Historical Fiction, Poetry, Essay, Memoir, Philosophy, History, Indigenous Knowledge & Spirituality, Anthropology, Science & Technology, Design, Journalism
- **~43 countries** of origin — distribution is heavily skewed (USA likely dominant, many countries with 1–3 books)
- **4 gender values**: Male, Female, Anonimo, Queer
- **Publication years**: wide range (some books from the 1940s–1960s, most from 2000s–2020s)
- **Reading years**: 2017–2025 (9 years)
- **3 formats**: Paper, Digital, Kindle

---

## What the design spec says about Data view

From `books-books-design-spec.md` (your spec):

> "The reading history as a visual artifact. Data IS the composition — the Idea magazine cover energy. This view doesn't need to be browsable in the same way; it's more like a poster that happens to be live."

- **Dark background** (inverted from shelf's light feel) — ✅ this is correct per spec
- **Bold color coding from the genre palette** — the spec says genre palette, not flags
- **Minimal chrome — the data visualization fills the viewport**
- **References**: Idea magazine #349, Federica Fragapane, Nicholas Felton annual reports

---

## Decisions you've made (in conversation order)

These are your explicit instructions across all iterations:

1. **Grid layout** — not treemap, not force scatter, not cluster. A grid where items make the structure.
2. **Y axis = Genre** (most recent decision) — "genre, and have the colors resemble the flags, there's always gonna be more countries than genres"
3. **Cell width = age of book** — `2026 - published year + 1`. Older books are wider.
4. **Color = country flag** — each cell's fill color should resemble the flag of the book's country of origin
5. **Gender = conventional icons** (♀ ♂ ⚧ ⚥) — "smaller icon inside the cell, colored with the flag, use the conventional icons"
6. **Grid lines always visible on top** — "otherwise things blend, you can't tell shit"
7. **All 199 books visible at once** — no scrolling, one cell per book
8. **Legend as part of the grid structure** — not floating over data
9. **Items make the structure** — no pre-drawn background grid, the colored cells ARE the grid
10. **"No beige"** — bold, saturated palette

---

## The core problem that keeps causing failures

**Relative width scaling per row.**

When cell width = `(bookAge / totalRowAge) × chartWidth`, every row fills 100% of the available width regardless of how many books it has. This means:

- A genre with 2 books: each book takes 50% of the row width
- A genre with 50 books: each book gets ~2% of the row width
- A 5-year-old book in "Design" (few books) can appear WIDER than a 80-year-old book in "Fiction" (many books)

**This breaks the visual promise that "wider = older."** Width becomes relative to the row, not absolute. That's what made Tanzania's single book fill the entire row in the country-based version.

### Possible fixes

**Option A — Global absolute scale:**
Define `pixelsPerYear = chartWidth / maxRowTotalAge`. The genre with the most total age fills 100%. All other genres are proportionally shorter (empty space on right). Width IS comparable across rows. Tradeoff: some rows will be visually sparse.

**Option B — Keep relative but accept it:**
Each row fills 100%. Width comparisons only work WITHIN a genre row, not across rows. This is a conscious design choice — you're showing composition within each genre, not comparing genres.

**Option C — Hybrid:**
Use a log scale or square-root scale for width so the ratio between oldest and newest isn't as extreme. Reduces the problem without empty space.

---

## The flag color problem (honest assessment)

~43 countries need distinct colors. Many flags share the same dominant color — roughly 15 countries have red, 12 have green, 6 have blue. In a data visualization where color = primary identifier, having half your values be "some shade of red/green" makes identification unreliable without hovering.

### Options

**Option A — Use flag colors as-is (artistic):**
Accept that you can't identify all 43 countries by color alone. The viz reads as a textured poster — you see broad patterns (bands of green = African/South American, bands of red = various), and hover for specifics. This matches the "poster that happens to be live" spec.

**Option B — Use genre color for fill, flag color for icon/border:**
Cell fill = genre color (13 values, highly legible). A small flag-colored dot or border indicates country. Best of both worlds for readability, but less visually dramatic.

**Option C — Group countries into ~8 regions, assign distinct colors:**
Americas, Europe, West Africa, East Africa, Middle East, South Asia, East Asia, Oceania. Fewer values = more legible color encoding. Loses per-country specificity.

---

## The "greyed out" elements issue

The current code reads `genreFilter` from the store (`filters.genre`). When this array is non-empty, any genre row NOT in the filter gets dimmed to `opacity: 0.06`. If you see greyed-out elements without having set a filter, either:

1. A filter is active that you didn't notice (check FilterBar for active pills)
2. Or there's a state bug where `filters.genre` isn't resetting properly

The DataView also reads `books` (all books) not `filteredBooks`. This means year/origin/gender/format filters from FilterBar are IGNORED in DataView — only genre filters affect the dimming. This inconsistency should be fixed regardless of other decisions.

---

## What needs to be decided ONCE to stop circling

| # | Question | Your last answer | Needs confirmation? |
|---|----------|-----------------|-------------------|
| 1 | Y axis | Genre rows | Locked? |
| 2 | Cell color | Country flag colors | Or revert to genre palette per spec? |
| 3 | Width scale | Age of book | Absolute (A) or relative per row (B)? |
| 4 | Gender encoding | Conventional ♀♂⚧⚥ icons | Locked? |
| 5 | Background | Dark | Locked (matches spec)? |
| 6 | Should DataView respect ALL active filters? | Not decided | Yes = filter books before viz. No = always show all 198, dim filtered ones. |
| 7 | What happens in narrow cells? | Not decided | Hide icon? Show nothing? Scale down? |

---

## My recommendation (take it or leave it)

Given the "poster that happens to be live" vision and the IDEA 349 reference:

- **Y = Genre** (13 rows) ✅
- **Color = Country flags** (artistic, not perfectly legible — hover fills the gap) ✅
- **Width = Age, ABSOLUTE scale** (Option A) — fix the core scaling bug
- **Gender = ♀♂⚧⚥** conventional icons, white on dark flags, dark on light flags ✅
- **Dark background** per spec ✅
- **Respect all filters** — use `filteredBooks` from store, not `books`
- **Narrow cells** — hide icon below 8px width, still show colored cell
- **Sort within genre row** — by country (groups flag colors into bands), then by age within country

Lock these. Build once. Iterate on visual details (spacing, font size, legend layout) without changing architecture.
