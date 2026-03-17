import { NextResponse } from 'next/server';
import type { Book } from '@/types';

const NOTION_API = 'https://api.notion.com/v1';
const DATABASE_ID = '79ddcf35-ec93-4f94-9ac0-b45aedc44b29';
const NOTION_VERSION = '2022-06-28';

// --- Notion property extractors ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getText(prop: any): string {
  if (!prop) return '';
  if (prop.type === 'rich_text') return prop.rich_text?.map((t: any) => t.plain_text).join('') ?? '';
  if (prop.type === 'title') return prop.title?.map((t: any) => t.plain_text).join('') ?? '';
  return '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSelect(prop: any): string {
  if (!prop) return '';
  return prop.select?.name ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNumber(prop: any): number {
  if (!prop) return 0;
  return prop.number ?? 0;
}

// Handles Notion's url property type AND rich_text fields that contain URLs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getUrl(prop: any): string {
  if (!prop) return '';
  if (prop.type === 'url') return prop.url ?? '';
  // Fallback: some older entries may still be rich_text
  if (prop.type === 'rich_text') return prop.rich_text?.map((t: any) => t.plain_text).join('') ?? '';
  return '';
}

// Notion's Title property name has a BOM from the original CSV import — try both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTitleProp(properties: any): any {
  return (
    properties['Title'] ??
    properties['\uFEFFTitle'] ??  // BOM variant from CSV import
    Object.values(properties).find((p: any) => p.type === 'title')
  );
}

// --- Fetch all pages with pagination ---

async function fetchAllBooks(token: string): Promise<Book[]> {
  const books: Book[] = [];
  let cursor: string | undefined = undefined;
  let page = 1;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion API error (page ${page}): ${res.status} — ${err}`);
    }

    const data = await res.json();
    console.log(`[books/route] Fetched page ${page}: ${data.results.length} entries`);

    for (const notionPage of data.results) {
      const props = notionPage.properties;

      const title = getText(getTitleProp(props));

      // Skip duplicates (flagged during Phase 1), blanks, and archived entries
      if (!title || title.startsWith('DUPLICATE') || notionPage.archived) continue;

      const book: Book = {
        id: notionPage.id,
        title,
        author:    getText(props['Author']),
        origin:    getSelect(props['Origin']),
        genre:     getSelect(props['Genre']),
        gender:    getSelect(props['Gender']),
        published: getText(props['Published']),
        year:      getNumber(props['Year']),
        dateRead:  getNumber(props['Date Read']),
        format:    getSelect(props['Format']),
        brief:     getText(props['Brief']) || undefined,
        quotes:    getText(props['Quotes']) || undefined,
        coverUrl:  getUrl(props['Thumbnail url']) || undefined,
      };

      books.push(book);
    }

    cursor = data.has_more ? data.next_cursor : undefined;
    page++;
  } while (cursor);

  // Sort by year desc, then dateRead asc — most recent first, in reading order
  books.sort((a, b) => b.year - a.year || a.dateRead - b.dateRead);

  return books;
}

// --- Google Books cover fallback ---
// For books that have no Thumbnail url in Notion, query Google Books by
// title + author to find a cover image.  Results are fetched in batches of 8
// in parallel.  The route-level Cache-Control means this only runs once/hour.

async function fetchGoogleBooksCover(title: string, author: string): Promise<string | undefined> {
  try {
    const q = encodeURIComponent(`intitle:${title}${author ? ` inauthor:${author}` : ''}`);
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&fields=items(volumeInfo/imageLinks)`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const thumb: string | undefined = data.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
    // Google returns http:// thumbnails — upgrade to https and request larger zoom
    return thumb
      ? thumb.replace('http://', 'https://').replace('zoom=1', 'zoom=2')
      : undefined;
  } catch {
    return undefined;
  }
}

async function fillMissingCovers(books: Book[]): Promise<void> {
  const missing = books.filter(b => !b.coverUrl);
  if (missing.length === 0) return;
  console.log(`[books/route] Fetching Google Books covers for ${missing.length} books…`);

  const BATCH = 8;
  for (let i = 0; i < missing.length; i += BATCH) {
    await Promise.all(
      missing.slice(i, i + BATCH).map(async (book) => {
        const url = await fetchGoogleBooksCover(book.title, book.author);
        if (url) book.coverUrl = url;
      }),
    );
  }

  const filled = missing.filter(b => b.coverUrl).length;
  console.log(`[books/route] Filled ${filled}/${missing.length} missing covers from Google Books`);
}

// --- Route handler ---

export async function GET() {
  const token = process.env.NOTION_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: 'NOTION_TOKEN is not set. Add it to .env.local.' },
      { status: 500 }
    );
  }

  try {
    const books = await fetchAllBooks(token);
    await fillMissingCovers(books);

    return NextResponse.json(books, {
      headers: {
        // Cache for 1 hour — books don't change frequently.
        // Set to 0 during active data entry.
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[books/route] Failed to fetch from Notion:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
