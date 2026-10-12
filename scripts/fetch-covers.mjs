#!/usr/bin/env node
/**
 * fetch-covers.mjs
 * Finds all books in Notion missing a "Thumbnail url", tries Google Books
 * then Open Library, and patches the Notion page with the found URL.
 * Books that already have a cover are never touched.
 *
 * Usage (from the project root):
 *   npm run covers:preview   # preview only, writes nothing
 *   npm run covers           # write covers to Notion
 *
 * The token is read from NOTION_TOKEN in the environment, or else from
 * .env.local in the project root (see .env.local.example). An explicit
 * environment variable always wins over the file.
 *
 * Safety rules. A wrong cover is worse than no cover, so:
 *   1. A book with an empty "Author" in Notion is SKIPPED. Searching by title
 *      alone often finds a different book. Fill in Author and run again.
 *      (Add --include-no-author to search anyway, e.g. for anonymous works:
 *       npm run covers:preview -- --include-no-author)
 *   2. A search result is only accepted if it shares a surname with the Notion
 *      Author. Otherwise it is listed as "needs review" and NOT saved.
 *   3. Only empty covers are filled. Existing covers are never overwritten.
 *
 * Even an accepted match can be another edition (for example a translation),
 * so the preview prints the Notion author and the matched title and author.
 * Read them before running the real thing.
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

const NOTION_TOKEN   = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  console.error("❌ NOTION_TOKEN not found. Add it to .env.local in the project root (copy .env.local.example), or export it in your shell.");
  process.exit(1);
}
const DRY_RUN           = process.argv.includes("--dry-run");
const INCLUDE_NO_AUTHOR = process.argv.includes("--include-no-author");
const DATABASE_ID    = "79ddcf35-ec93-4f94-9ac0-b45aedc44b29";
const NOTION_VERSION = "2022-06-28";
const NOTION_API     = "https://api.notion.com/v1";

// ── Notion helpers ─────────────────────────────────────────────────────────────

function getText(prop) {
  if (!prop) return "";
  if (prop.type === "rich_text") return prop.rich_text?.map(t => t.plain_text).join("") ?? "";
  if (prop.type === "title")     return prop.title?.map(t => t.plain_text).join("") ?? "";
  return "";
}

function getUrl(prop) {
  if (!prop) return "";
  if (prop.type === "url")       return prop.url ?? "";
  if (prop.type === "rich_text") return prop.rich_text?.map(t => t.plain_text).join("") ?? "";
  return "";
}

function getTitleProp(props) {
  return (
    props["Title"] ??
    props["\uFEFFTitle"] ??
    Object.values(props).find(p => p.type === "title")
  );
}

// ── Author matching ────────────────────────────────────────────────────────────

// Lowercase, strip accents, split into words (letters and digits, any script).
function words(s) {
  return (s ?? "")
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// True if the surname (last word) of at least one author listed in Notion
// appears among the authors the search result returned. Handles "Graham, Paul"
// vs "Paul Graham", accents, and several authors separated by , ; & "and" "y".
// A Cyrillic or Japanese edition of a Latin-script name will NOT match, which
// is intended: it gets flagged for review instead of being saved.
function authorMatches(notionAuthor, matchedAuthors) {
  const found = new Set(words(matchedAuthors));
  return (notionAuthor ?? "")
    .split(/[,;&]|\sand\s|\sy\s/i)
    .map(name => words(name).pop())
    .filter(w => w && w.length >= 2)
    .some(surname => found.has(surname));
}

// ── Fetch all pages from Notion ────────────────────────────────────────────────

async function fetchAllBooks() {
  const books = [];
  let cursor  = undefined;
  let page    = 1;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        Authorization:    `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type":   "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Notion query failed (page ${page}): ${res.status} ${await res.text()}`);

    const data = await res.json();
    console.log(`  Notion page ${page}: ${data.results.length} entries`);

    for (const notionPage of data.results) {
      const props   = notionPage.properties;
      const title   = getText(getTitleProp(props));
      if (!title || title.startsWith("DUPLICATE") || notionPage.archived) continue;

      const coverUrl = getUrl(props["Thumbnail url"]);
      if (coverUrl) continue; // already has a cover — skip

      books.push({
        id:     notionPage.id,
        title,
        author: getText(props["Author"]).trim(),
      });
    }

    cursor = data.has_more ? data.next_cursor : undefined;
    page++;
  } while (cursor);

  return books;
}

// ── Cover sources ──────────────────────────────────────────────────────────────
// Each returns a list (possibly empty) of candidates:
//   { url, matched, authors }
// `matched` is the title and author the source actually returned, shown in the
// output so wrong matches are visible. `authors` is used for the author check.

async function tryGoogleBooks(title, author) {
  try {
    const q   = encodeURIComponent(`intitle:${title}${author ? ` inauthor:${author}` : ""}`);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=5&fields=items(volumeInfo/imageLinks,volumeInfo/title,volumeInfo/authors)`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []).flatMap(item => {
      const info  = item.volumeInfo;
      const thumb = info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail;
      if (!thumb) return [];
      const authors = (info.authors ?? []).join(", ");
      return [{
        url:     thumb.replace("http://", "https://").replace("zoom=1", "zoom=2"),
        matched: `${info.title ?? "?"}${authors ? " — " + authors : ""}`,
        authors,
      }];
    });
  } catch { return []; }
}

async function tryOpenLibrary(title, author) {
  try {
    const q   = encodeURIComponent(`${title}${author ? ` ${author}` : ""}`);
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${q}&limit=5&fields=key,title,author_name,cover_i`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs ?? []).filter(d => d.cover_i).map(doc => {
      const authors = (doc.author_name ?? []).join(", ");
      return {
        url:     `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
        matched: `${doc.title ?? "?"}${authors ? " — " + authors : ""}`,
        authors,
      };
    });
  } catch { return []; }
}

// Try Google Books, then Open Library. Take the first candidate whose author
// matches the Notion author (or the first one at all, when the book has no
// author and --include-no-author was given).
// Returns { source, hit }, or { rejected: { source, hit } } when results were
// found but none had the right author, or undefined when nothing was found.
async function findCover(book) {
  let firstRejected;
  for (const [source, lookup] of [["Google", tryGoogleBooks], ["OpenLib", tryOpenLibrary]]) {
    for (const hit of await lookup(book.title, book.author)) {
      if (!book.author || authorMatches(book.author, hit.authors)) return { source, hit };
      firstRejected ??= { source, hit };
    }
  }
  return firstRejected ? { rejected: firstRejected } : undefined;
}

// ── Patch Notion page ──────────────────────────────────────────────────────────

async function patchCover(pageId, url) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization:    `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type":   "application/json",
    },
    body: JSON.stringify({
      properties: {
        "Thumbnail url": { url },
      },
    }),
  });
  if (!res.ok) throw new Error(`Notion patch failed for ${pageId}: ${res.status} ${await res.text()}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN
    ? "📚 DRY RUN — nothing will be written to Notion"
    : "📚 Fetching books without covers from Notion…");
  const missing = await fetchAllBooks();
  console.log(`\n→ ${missing.length} books need covers\n`);

  if (missing.length === 0) {
    console.log("✅ All books already have covers!");
    return;
  }

  // Books with no Author are not searched (see the safety rules at the top).
  const toSearch = [];
  const noAuthor = [];
  for (const book of missing) {
    (book.author || INCLUDE_NO_AUTHOR ? toSearch : noAuthor).push(book);
  }
  for (const book of noAuthor) {
    console.log(`  ⏭️  Skipped, no Author in Notion: ${book.title}  → fill in Author, then run again`);
  }
  if (noAuthor.length) console.log("");

  let filled = 0;   // saved (or, in a dry run, would be saved)
  let notFound = 0;
  let review = 0;   // found, but by a different author: not saved
  let failed = 0;   // Notion refused the write

  const BATCH = 5; // keep it polite to both APIs
  for (let i = 0; i < toSearch.length; i += BATCH) {
    const batch = toSearch.slice(i, i + BATCH);

    await Promise.all(batch.map(async book => {
      const who = book.author ? `Notion author: ${book.author}` : "no author in Notion";
      const found = await findCover(book);

      if (!found) {
        console.log(`  ⚠️  No cover found: ${book.title} (${book.author || "no author"})`);
        notFound++;
        return;
      }

      if (found.rejected) {
        const { source, hit } = found.rejected;
        console.log(`  🚫 Needs review, NOT saved: "${book.title}" (${who}) → [${source}] found "${hit.matched}", a different author`);
        review++;
        return;
      }

      const { source, hit } = found;

      if (DRY_RUN) {
        console.log(`  🔎 [${source}] "${book.title}" (${who}) → matched "${hit.matched}"`);
        filled++;
        return;
      }

      try {
        await patchCover(book.id, hit.url);
        console.log(`  ✅ [${source}] ${book.title}  (${who}; matched: ${hit.matched})`);
        filled++;
      } catch (err) {
        console.error(`  ❌ Notion patch failed: ${book.title} — ${err.message}`);
        failed++;
      }
    }));

    // Small delay between batches to avoid rate limiting
    if (i + BATCH < toSearch.length) await new Promise(r => setTimeout(r, 300));
  }

  const rest = `${notFound} not found, ${review} need review, ${noAuthor.length} skipped (no author)` +
    (failed ? `, ${failed} failed to save` : "");
  console.log(DRY_RUN
    ? `\n🔎 Dry run done — ${filled} would be saved, ${rest}. Nothing was written.`
    : `\n✅ Done — ${filled} covers saved, ${rest}.`);

  if (notFound + review + noAuthor.length > 0) {
    console.log("\nFor books that were not saved: check or fill in Author in Notion and run again,");
    console.log("or paste a cover image URL into \"Thumbnail url\" by hand.");
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
