# Books Books — Project Tracker

> **Last updated:** 2026-03-11 | **Session count:** 7
> **Upload this file at the start of every new Claude session.**

---

## What This Is

A personal reading library visualizer — a public portfolio microsite pulling live data from a Notion database (maintained since 2017, ~198 books) into an interactive, filterable experience. First project in a broader series exploring data sources + design + AI-assisted development.

## Vision

Dual-panel layout: a filterable title list (island panel) alongside a horizontal cover shelf with perspective depth. Filtering is the hero interaction — filters reshuffle the shelf with GSAP spring animations. The experience should feel spatial, editorial, design-forward. Three views: Shelf (primary), Index (typographic catalog), Data (reading history as visual artifact).

## Tech Stack (Locked)

- **Framework:** Next.js 16 (App Router) — Antigravity built this; staying with it
- **Animation — UI/filtering:** GSAP + GSAP Flip plugin (filter reshuffle, panel transitions)
- **Animation — Cover shelf:** CSS 3D transforms now; R3F/Three.js for future upgrade when perspective axis deepens
- **State:** Zustand
- **Charts:** D3.js
- **Data source:** Notion API (`/api/books` route → Notion REST API)
- **Deployment:** Vercel or Cloudflare
- **Dev environment:** Google Antigravity (agentic IDE) for frontend build
- **Claude's role:** Strategy, data layer, architecture decisions, audit/review, PM

## Data Schema (Notion)

| Property | Type | Notes |
|---|---|---|
| Title | Title | Has BOM prefix `\uFEFF` from CSV import — API handles both variants |
| Author | Rich text | |
| Origin | Select | 43 countries — normalized Phase 1 |
| Genre | Select | 13 categories — normalized Phase 1 |
| Gender | Select | Male, Female, Anonimo, Queer |
| Published | Rich text | Year originally published |
| Date Read | Number | Reading order within year |
| Year | Number | Year book was read (2017–2025) |
| Format | Select | Digital, Paper, Kindle |
| Brief | Rich text | Personal synopsis |
| Quotes | Rich text | Notable passages |
| Thumbnail | Rich text | Legacy field — unused |
| Thumbnail url | Rich text | Cover image URL (written this way — not URL type) |

**Notion DB ID:** `79ddcf35-ec93-4f94-9ac0-b45aedc44b29`
**Data Source ID:** `a8e5b0b4-0455-4c17-91bd-bf4f7342f66e`

**Genre taxonomy (13):** Fiction, Science Fiction, Historical Fiction, Poetry, Essay, Memoir, Philosophy, History, Indigenous Knowledge & Spirituality, Anthropology, Science & Technology, Design, Journalism

## Genre Color Palette

Defined in `src/lib/genreColor.ts` and `src/app/globals.css`. Applied consistently across FilterBar, IslandPanel, DetailPanel, DataView.

---

## Phase Roadmap

### Phase 1 — Data Layer ✅ COMPLETE

| Task | Status |
|---|---|
| Origin normalization (43 books) | ✅ Done |
| Genre normalization (38 books) | ✅ Done |
| Author correction (DeLillo) | ✅ Done |
| Cover sourcing (194/198 = 98%) | ✅ Done |
| Duplicates removed | ✅ Verified clean Session 6 |
| 4 missing covers | ⚠️ Niche editions — manual or leave empty |

### Phase 2 — Data Pipeline ✅ COMPLETE (Session 7)

| Task | Status |
|---|---|
| Notion API route (`/app/api/books/route.ts`) | ✅ Done |
| Full schema transformation (all 12 fields) | ✅ Done |
| Pagination handling (100/page) | ✅ Done |
| Cache headers (1hr s-maxage + SWR) | ✅ Done |
| Zustand store rewrite — real fetch, loading/error states | ✅ Done |
| 5-dimensional filter state (year/genre/origin/gender/format) | ✅ Done |
| Derived filter options from real data | ✅ Done |
| All components migrated off static JSON | ✅ Done |
| `.env.local.example` created | ✅ Done |

**To activate:** Copy `.env.local.example` → `.env.local`, add real `NOTION_TOKEN`, run `npm run dev`.

### Phase 3 — Shelf View & Core Layout 🔲 NEXT

The primary visual experience. Current CSS 3D is a placeholder — needs real spatial depth, scroll behavior, and the island panel working in sync.

| Task | Status | Effort |
|---|---|---|
| GSAP Flip filter reshuffle animation | 🔲 Not started | 1 session |
| Shelf perspective — per-book z-depth (not container tilt) | 🔲 Not started | 1–2 sessions |
| Year-group separators on shelf | 🔲 Not started | 0.5 session |
| Book thickness / spine edge | 🔲 Not started | 1 session |
| Island panel scroll-sync with shelf | 🔲 Not started | 1 session |
| Filter bar collapsible tray (origin/gender/format collapse) | 🔲 Not started | 1 session |
| Active filter pill row with × dismiss | 🔲 Not started | 0.5 session |

### Phase 4 — Detail Panel & Index Polish 🔲

| Task | Status | Effort |
|---|---|---|
| Detail panel real quotes rendering (split on double newline) | ✅ Done Session 7 | — |
| Detail panel real metadata (all fields wired) | ✅ Done Session 7 | — |
| Detail panel — shelf visible behind, not fully blocked | ✅ Done Session 7 | — |
| Index view — Origin column added | ✅ Done Session 7 | — |
| Index view — genre color chips | ✅ Done Session 7 | — |
| Index view — alternating row tones | ✅ Done Session 7 | — |
| View transition animations (shelf → index → data) | 🔲 Not started | 1 session |
| Island panel mobile bottom sheet | 🔲 Not started | 1 session |

### Phase 5 — Data View 🔲

| Task | Status | Effort |
|---|---|---|
| Timeline density chart (D3 stacked by genre) | 🔲 Not started | 1 session |
| Genre/gender breakdown per year | 🔲 Not started | 1 session |
| Editorial stats block (total, avg/year, top genre, top origin) | 🔲 Not started | 0.5 session |
| Origin geography visualization | 🔲 Not started | 2 sessions |

### Phase 6 — Polish & Ship 🔲

| Task | Status | Effort |
|---|---|---|
| Loading skeleton screens | 🔲 Not started | 0.5 session |
| Image lazy loading + blur-up | 🔲 Not started | 0.5 session |
| Mobile shelf (cover flow) | 🔲 Not started | 1–2 sessions |
| SEO, meta tags, Open Graph | 🔲 Not started | 0.5 session |
| Performance audit (FPS, LCP, bundle) | 🔲 Not started | 1 session |
| Deploy to production | 🔲 Not started | 0.5 session |

---

## Open Decisions

| Decision | Status | Notes |
|---|---|---|
| R3F upgrade for shelf | Open | CSS 3D now; R3F if perspective needs true per-book z-depth + lighting |
| Book-open transition | Open | Decide during Phase 3 — camera push vs geometry morph |
| Filter bar layout | Open | All 5 dimensions shown inline is too wide on desktop — needs collapsible tray |
| Antigravity prompt templates | Open | Need structured prompts for agentic IDE sessions |
| Deployment target | Open | Vercel simpler for ISR; Cloudflare lighter |

## Known Constraints

- **Notion rich_text API:** Python writes silently fail; MCP tools and the fetch API work fine
- **Cover gaps:** 4 niche editions (Preludio al té, Pálido cielo, Antes de Colombia, The Most Dangerous Man in America)
- **Title BOM:** Notion property `Title` has `\uFEFF` prefix from CSV import — API route handles both
- **Rate limits:** Notion API 3 req/sec; route uses pagination, not parallel requests

---

## Session Log

### Sessions 1–5 — Mar 1–3, 2026
Phase 1 complete: schema conversion, data normalization (82 corrections), cover sourcing (194/198, 98%). See Phase 1 section for details.

### Session 6 — Mar 11, 2026
**Focus:** Project reorganization + tech decisions
Moved PM to this portable markdown file. Locked stack: Next.js + GSAP + CSS 3D (R3F upgrade path). Audited Antigravity first pass against design spec — found no real data, no GSAP, no R3F, placeholder metadata. Full audit in `AUDIT.md`.

### Session 7 — Mar 11, 2026
**Focus:** Real data layer (Phase 2)
Built `/app/api/books/route.ts` — full Notion REST API integration, all 12 fields, pagination, 1hr cache. Rewrote Zustand store: real fetch on init, 5 filter dimensions, loading/error states, derived filter options from live data. Migrated all components off static JSON to real `Book` type. Wired `initialize()` in page.tsx with loading/error states. Added `genreColor.ts` utility. Applied genre palette in IslandPanel, DetailPanel, FilterBar, IndexView. Fixed IslandPanel count, added genre dot. DetailPanel now shows real metadata + actual quotes. IndexView gets Origin column + genre chips. TypeScript check: 0 errors.

---

## How To Use This File

1. **Start a new Claude session** → Upload this file
2. **State the task** → Reference a specific phase, component, or open decision
3. **End of session** → Ask Claude to update the Session Log and task statuses
4. **Save the updated file** → It's your single source of truth

**Example opener:**
> "Here's my project tracker [attach file]. I want to work on Phase 3 — GSAP filter reshuffle and the shelf perspective. Update the tracker when we're done."
