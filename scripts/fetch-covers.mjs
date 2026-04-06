#!/usr/bin/env node
/**
 * fetch-covers.mjs
 * Finds all books in Notion missing a "Thumbnail url", tries Google Books
 * then Open Library, and patches the Notion page with the found URL.
 *
 * Run from project root:
 *   node scripts/fetch-covers.mjs
 */

const NOTION_TOKEN   = process.env.NOTION_TOKEN;
if (!NOTION_TOKEN) {
  console.error("❌ NOTION_TOKEN env var not set. Run with: NOTION_TOKEN=your_token node scripts/fetch-covers.mjs");
  process.exit(1);
}
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
        author: getText(props["Author"]),
      });
    }

    cursor = data.has_more ? data.next_cursor : undefined;
    page++;
  } while (cursor);

  return books;
}

// ── Cover sources ──────────────────────────────────────────────────────────────

async function tryGoogleBooks(title, author) {
  try {
    const q   = encodeURIComponent(`intitle:${title}${author ? ` inauthor:${author}` : ""}`);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=3&fields=items(volumeInfo/imageLinks,volumeInfo/title)`,
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const thumb = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail
               ?? data.items?.[0]?.volumeInfo?.imageLinks?.smallThumbnail;
    return thumb
      ? thumb.replace("http://", "https://").replace("zoom=1", "zoom=2")
      : undefined;
  } catch { return undefined; }
}

async function tryOpenLibrary(title, author) {
  try {
    const q   = encodeURIComponent(`${title}${author ? ` ${author}` : ""}`);
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${q}&limit=3&fields=key,cover_i`,
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const coverId = data.docs?.find(d => d.cover_i)?.cover_i;
    return coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
      : undefined;
  } catch { return undefined; }
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
  console.log("📚 Fetching books without covers from Notion…");
  const missing = await fetchAllBooks();
  console.log(`\n→ ${missing.length} books need covers\n`);

  if (missing.length === 0) {
    console.log("✅ All books already have covers!");
    return;
  }

  let filled = 0;
  let failed = 0;

  const BATCH = 5; // keep it polite to both APIs
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);

    await Promise.all(batch.map(async book => {
      // Try Google Books first, then Open Library
      let url = await tryGoogleBooks(book.title, book.author);
      const source = url ? "Google" : "OpenLib";
      if (!url) url = await tryOpenLibrary(book.title, book.author);

      if (url) {
        try {
          await patchCover(book.id, url);
          console.log(`  ✅ [${source}] ${book.title}`);
          filled++;
        } catch (err) {
          console.error(`  ❌ Notion patch failed: ${book.title} — ${err.message}`);
          failed++;
        }
      } else {
        console.log(`  ⚠️  No cover found: ${book.title} (${book.author})`);
        failed++;
      }
    }));

    // Small delay between batches to avoid rate limiting
    if (i + BATCH < missing.length) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n✅ Done — ${filled} covers saved, ${failed} not found`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
