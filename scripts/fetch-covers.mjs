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
 * The preview prints which book each cover was matched to, so you can spot
 * wrong matches (wrong edition, different book) before anything is saved.
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
const DRY_RUN        = process.argv.includes("--dry-run");
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
    props["﻿Title"] ??
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
// Each returns { url, matched } or undefined. `matched` is the title/author the
// source actually returned, shown in the output so wrong matches are visible.

async function tryGoogleBooks(title, author) {
  try {
    const q   = encodeURIComponent(`intitle:${title}${author ? ` inauthor:${author}` : ""}`);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=3&fields=items(volumeInfo/imageLinks,volumeInfo/title,volumeInfo/authors)`,
    );
    if (!res.ok) return undefined;
    const data  = await res.json();
    const info  = data.items?.[0]?.volumeInfo;
    const thumb = info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail;
    if (!thumb) return undefined;
    return {
      url:     thumb.replace("http://", "https://").replace("zoom=1", "zoom=2"),
      matched: `${info.title ?? "?"}${info.authors ? " — " + info.authors.join(", ") : ""}`,
    };
  } catch { return undefined; }
}

async function tryOpenLibrary(title, author) {
  try {
    const q   = encodeURIComponent(`${title}${author ? ` ${author}` : ""}`);
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${q}&limit=3&fields=key,title,author_name,cover_i`,
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const doc  = data.docs?.find(d => d.cover_i);
    if (!doc) return undefined;
    return {
      url:     `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
      matched: `${doc.title ?? "?"}${doc.author_name ? " — " + doc.author_name.join(", ") : ""}`,
    };
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
  console.log(DRY_RUN
    ? "📚 DRY RUN — nothing will be written to Notion"
    : "📚 Fetching books without covers from Notion…");
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
      let hit    = await tryGoogleBooks(book.title, book.author);
      let source = "Google";
      if (!hit) {
        hit    = await tryOpenLibrary(book.title, book.author);
        source = "OpenLib";
      }

      if (!hit) {
        console.log(`  ⚠️  No cover found: ${book.title} (${book.author})`);
        failed++;
        return;
      }

      if (DRY_RUN) {
        console.log(`  🔎 [${source}] "${book.title}" → matched "${hit.matched}"`);
        filled++;
        return;
      }

      try {
        await patchCover(book.id, hit.url);
        console.log(`  ✅ [${source}] ${book.title}  (matched: ${hit.matched})`);
        filled++;
      } catch (err) {
        console.error(`  ❌ Notion patch failed: ${book.title} — ${err.message}`);
        failed++;
      }
    }));

    // Small delay between batches to avoid rate limiting
    if (i + BATCH < missing.length) await new Promise(r => setTimeout(r, 300));
  }

  console.log(DRY_RUN
    ? `\n🔎 Dry run done — ${filled} would be saved, ${failed} not found. Nothing was written.`
    : `\n✅ Done — ${filled} covers saved, ${failed} not found`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
