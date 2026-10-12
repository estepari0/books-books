# Books Books

A personal reading library visualizer: a public microsite that pulls live data from a Notion database of books (tracked since 2017) into a filterable, animated experience. Three views: Shelf, Index and Data.

Live: https://books-books-orcin.vercel.app

Built with Next.js 16 (App Router), React 19, Zustand, GSAP, D3 and Tailwind 4.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then put your Notion token in .env.local
npm run dev
```

Open http://localhost:3000. `.env.local` is git-ignored; never commit a real token.

## How the data flows

`src/app/api/books/route.ts` queries the Notion database (100 rows per page), flattens each row into a `Book` object, and caches the result for an hour (in-process plus CDN headers). Books with no cover in Notion get a Google Books lookup at request time.

Changes in Notion can take up to about an hour to show on the site. Redeploying in Vercel shows them immediately.

## Adding books (routine)

1. In Notion, add the book and fill in Title, Author, Genre, Origin, Gender, Format, Published, Year and Date Read. Use the dropdowns for the select fields. Fill in **Author** before looking for covers: the cover search needs it.
2. Find covers for any books that don't have one:
   ```bash
   npm run covers:preview   # shows what each book would be matched to; writes nothing
   npm run covers           # saves the covers to Notion
   ```
   Read the preview first. A wrong cover is worse than none, so the script is strict:
   - A book with an **empty Author** is skipped. Searching by title alone often finds a different book. Fill in Author and run again. (For an anonymous work, add `-- --include-no-author`, as in `npm run covers:preview -- --include-no-author`.)
   - A match is only accepted if it shares a surname with your Author. Otherwise it is listed as "needs review" and **not saved**. A misspelled Author in Notion lands here too, so check the spelling.
   - Existing covers are never overwritten.

   An accepted match can still be a different edition, such as a translation, so look at the matched title and author the preview prints. For anything that was not saved, fix Author in Notion and run again, or paste a cover image URL into the "Thumbnail url" field by hand.
3. Fill in Brief and Quotes whenever you like.

## Notion token

The token for the "book cleanup" integration is needed in two places:

- `.env.local` on your computer (used by `npm run dev` and `npm run covers`)
- `NOTION_TOKEN` in Vercel, under Settings → Environment Variables (used by the live site). Redeploy after changing it.

If you refresh the token in Notion, update both. The old token stops working immediately.

## Notion gotchas

- **Write fields as URL or Select, not Rich text.** Writes to rich text fields from a script returned 200 OK but did not persist. The root cause was never isolated; the cover field started working once it was a URL field. For any new field a script must write, use URL or Select, or write through the Notion MCP tools.
- **Find the title column by type, not by name.** The database came from a CSV import and its title column used to carry an invisible `﻿` character. It was renamed to plain "Title" in October 2026, but the code still falls back to finding the column by type.
- **Date Read is the reading order within a year** (a small number), not a year.
