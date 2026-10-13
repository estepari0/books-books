#!/usr/bin/env node
/**
 * fetch-pages.mjs
 * Finds books in Notion with an empty "Pages" field, looks up an approximate
 * page count (Open Library first, Google Books second) and writes it to Notion.
 * The shelf uses Pages to set each book's spine thickness.
 *
 * Usage (from the project root):
 *   npm run pages:preview   # preview only, writes nothing
 *   npm run pages           # write page counts to Notion
 *
 * Before the first real run, add a field to the Notion database:
 *   name "Pages", type Number. The preview works without it; the write refuses.
 *
 * The count is an approximation, and that is fine for the shelf:
 *   - Open Library gives the MEDIAN page count across all known editions, which
 *     smooths out odd editions. Google Books gives one edition's count.
 *   - Your own edition may differ (translation, large print, pocket edition).
 *     To use your real count, type it into Pages by hand: the script never
 *     overwrites a value that is already there.
 *
 * Same safety rules as the cover script:
 *   1. A book with an empty Author is SKIPPED (add --include-no-author to
 *      search anyway).
 *   2. A result is only accepted if it shares a surname with the Notion Author.
 *   3. Counts outside 16–3000 pages are treated as junk and ignored.
 *   4. Existing values are never overwritten.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load KEY=value lines from .env.local / .env without overriding the environment.
function loadEnvFiles() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  for (const name of [".env.local", ".env"]) {
    const file = resolve(root, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let value = m[2];
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}
loadEnvFiles();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  console.error("❌ NOTION_TOKEN not found. Add it to .env.local in the project root (copy .env.local.example), or export it in your shell.");
  process.exit(1);
}
const DRY_RUN           = process.argv.includes("--dry-run");
const INCLUDE_NO_AUTHOR = process.argv.includes("--include-no-author");
const DATABASE_ID    = "79ddcf35-ec93-4f94-9ac0-b45aedc44b29";
const NOTION_VERSION = "2022-06-28";
const NOTION_API     = "https://api.notion.com/v1";
const PAGES_FIELD    = "Pages";
const MIN_SANE_PAGES = 16;
const MAX_SANE_PAGES = 3000;

const notionHeaders = {
  Authorization:    `Bearer ${NOTION_TOKEN}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type":   "application/json",
};

// ── Notion helpers ─────────────────────────────────────────────────────────────

function getText(prop) {
  if (!prop) return "";
  if (prop.type === "rich_text") return prop.rich_text?.map(t => t.plain_text).join("") ?? "";
  if (prop.type === "title")     return prop.title?.map(t => t.plain_text).join("") ?? "";
  return "";
}

function getTitleProp(props) {
  return props["Title"] ?? Object.values(props).find(p => p.type === "title");
}

// "ok" | "missing" | "wrong-type:<type>"
async function pagesFieldStatus() {
  const res = await fetch(`${NOTION_API}/databases/${DATABASE_ID}`, { headers: notionHeaders });
  if (!res.ok) throw new Error(`Could not read the database schema: ${res.status} ${await res.text()}`);
  const prop = (await res.json()).properties?.[PAGES_FIELD];
  if (!prop) return "missing";
  return prop.type === "number" ? "ok" : `wrong-type:${prop.type}`;
}

// ── Author matching (same rule as fetch-covers.mjs) ────────────────────────────

function words(s) {
  return (s ?? "")
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function authorMatches(notionAuthor, matchedAuthors) {
  const found = new Set(words(matchedAuthors));
  return (notionAuthor ?? "")
    .split(/[,;&]|\sand\s|\sy\s/i)
    .map(name => words(name).pop())
    .filter(w => w && w.length >= 2)
    .some(surname => found.has(surname));
}

// ── Fetch books with an empty Pages field ──────────────────────────────────────

async function fetchBooksWithoutPages() {
  const books = [];
  let cursor;
  let page = 1;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`${NOTION_API}/databases/${DATABASE_ID}/query`, {
      method: "POST", headers: notionHeaders, body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Notion query failed (page ${page}): ${res.status} ${await res.text()}`);
    const data = await res.json();
    console.log(`  Notion page ${page}: ${data.results.length} entries`);

    for (const notionPage of data.results) {
      const props = notionPage.properties;
      const title = getText(getTitleProp(props));
      if (!title || title.startsWith("DUPLICATE") || notionPage.archived) continue;
      if (typeof props[PAGES_FIELD]?.number === "number") continue; // already set — never overwrite
      books.push({ id: notionPage.id, title, author: getText(props["Author"]).trim() });
    }
    cursor = data.has_more ? data.next_cursor : undefined;
    page++;
  } while (cursor);
  return books;
}

// ── Page-count sources ─────────────────────────────────────────────────────────
// Each returns candidates: { pages, matched, authors }

const sane = n => Number.isFinite(n) && n >= MIN_SANE_PAGES && n <= MAX_SANE_PAGES;

async function tryOpenLibrary(title, author) {
  try {
    const params = new URLSearchParams({
      title, limit: "5", fields: "title,author_name,number_of_pages_median",
    });
    if (author) params.set("author", author);
    const res = await fetch(`https://openlibrary.org/search.json?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs ?? [])
      .filter(d => sane(d.number_of_pages_median))
      .map(d => {
        const authors = (d.author_name ?? []).join(", ");
        return {
          pages:   Math.round(d.number_of_pages_median),
          matched: `${d.title ?? "?"}${authors ? " — " + authors : ""}`,
          authors,
        };
      });
  } catch { return []; }
}

async function tryGoogleBooks(title, author) {
  try {
    const q   = encodeURIComponent(`intitle:${title}${author ? ` inauthor:${author}` : ""}`);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5&fields=items(volumeInfo/title,volumeInfo/authors,volumeInfo/pageCount)`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? [])
      .map(item => item.volumeInfo ?? {})
      .filter(info => sane(info.pageCount))
      .map(info => {
        const authors = (info.authors ?? []).join(", ");
        return {
          pages:   info.pageCount,
          matched: `${info.title ?? "?"}${authors ? " — " + authors : ""}`,
          authors,
        };
      });
  } catch { return []; }
}

async function findPages(book) {
  let firstRejected;
  for (const [source, lookup] of [["OpenLib", tryOpenLibrary], ["Google", tryGoogleBooks]]) {
    for (const hit of await lookup(book.title, book.author)) {
      if (!book.author || authorMatches(book.author, hit.authors)) return { source, hit };
      firstRejected ??= { source, hit };
    }
  }
  return firstRejected ? { rejected: firstRejected } : undefined;
}

async function patchPages(pageId, pages) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH", headers: notionHeaders,
    body: JSON.stringify({ properties: { [PAGES_FIELD]: { number: pages } } }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

// Read the row back: a 200 OK is not proof the value persisted (see the
// rich_text lesson in the maintenance doc).
async function readBackPages(pageId) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, { headers: notionHeaders });
  if (!res.ok) return undefined;
  return (await res.json()).properties?.[PAGES_FIELD]?.number;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const status = await pagesFieldStatus();
  if (status !== "ok") {
    const fix = status === "missing"
      ? `There is no "${PAGES_FIELD}" field in the Notion database yet.`
      : `The "${PAGES_FIELD}" field is type ${status.split(":")[1]}, not Number.`;
    if (!DRY_RUN) {
      console.error(`❌ ${fix} Add a Number field named "${PAGES_FIELD}" in Notion, then run again.`);
      process.exit(1);
    }
    console.log(`⚠️  ${fix} The preview still runs; add a Number field named "${PAGES_FIELD}" before the real run.\n`);
  }

  console.log(DRY_RUN
    ? "📚 DRY RUN — nothing will be written to Notion"
    : "📚 Fetching books without a page count from Notion…");
  const missing = await fetchBooksWithoutPages();
  console.log(`\n→ ${missing.length} books have no page count\n`);
  if (missing.length === 0) { console.log("✅ Every book has a page count."); return; }

  const toSearch = [];
  const noAuthor = [];
  for (const book of missing) (book.author || INCLUDE_NO_AUTHOR ? toSearch : noAuthor).push(book);
  for (const book of noAuthor) {
    console.log(`  ⏭️  Skipped, no Author in Notion: ${book.title}`);
  }
  if (noAuthor.length) console.log("");

  const found = [];
  let notFound = 0, review = 0, failed = 0;

  const BATCH = 5;
  for (let i = 0; i < toSearch.length; i += BATCH) {
    await Promise.all(toSearch.slice(i, i + BATCH).map(async book => {
      const who    = book.author ? `Notion author: ${book.author}` : "no author in Notion";
      const result = await findPages(book);

      if (!result) {
        console.log(`  ⚠️  No page count found: ${book.title} (${book.author || "no author"})`);
        notFound++;
        return;
      }
      if (result.rejected) {
        const { source, hit } = result.rejected;
        console.log(`  🚫 Needs review, NOT saved: "${book.title}" (${who}) → [${source}] ${hit.pages} p, "${hit.matched}", a different author`);
        review++;
        return;
      }

      const { source, hit } = result;
      if (DRY_RUN) {
        console.log(`  🔎 [${source}] ${String(hit.pages).padStart(4)} p  "${book.title}" (${who}) → matched "${hit.matched}"`);
        found.push(hit.pages);
        return;
      }
      try {
        await patchPages(book.id, hit.pages);
        const back = await readBackPages(book.id);
        if (back !== hit.pages) throw new Error(`write returned OK but the row reads back ${back ?? "empty"}`);
        console.log(`  ✅ [${source}] ${String(hit.pages).padStart(4)} p  ${book.title}  (matched: ${hit.matched})`);
        found.push(hit.pages);
      } catch (err) {
        console.error(`  ❌ Not saved: ${book.title} — ${err.message}`);
        failed++;
      }
    }));
    if (i + BATCH < toSearch.length) await new Promise(r => setTimeout(r, 300));
  }

  const rest = `${notFound} not found, ${review} need review, ${noAuthor.length} skipped (no author)` +
    (failed ? `, ${failed} failed to save` : "");
  console.log(DRY_RUN
    ? `\n🔎 Dry run done — ${found.length} would be saved, ${rest}. Nothing was written.`
    : `\n✅ Done — ${found.length} page counts saved, ${rest}.`);

  if (found.length) {
    const s = [...found].sort((a, b) => a - b);
    const q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    console.log(`   Range of counts found: min ${s[0]}, median ${q(0.5)}, 90th percentile ${q(0.9)}, max ${s[s.length - 1]}`);
  }
  if (notFound + review + noAuthor.length > 0) {
    console.log("\nBooks without a count simply keep a thin spine on the shelf.");
    console.log(`To set one by hand, type the number into the "${PAGES_FIELD}" field in Notion.`);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
