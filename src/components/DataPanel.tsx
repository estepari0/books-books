"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import gsap from "gsap";
import { useStore } from "@/store";
import { GENRE_COLORS } from "@/lib/genreColor";
import type { Book } from "@/types";

const GENRES = Object.keys(GENRE_COLORS);
const WINDOW_SIZE = 12; // books visible in the list at once

// ── Filter bar icons (from Figma node 4:2) ────────────────────────────────────
// Two separate arrow icons so each can be independently clicked
function FilterLeftArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="8" x2="4.5" y2="8" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
      <polyline points="8,5 4.5,8 8,11" fill="none" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FilterRightArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="8" x2="11.5" y2="8" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
      <polyline points="8,5 11.5,8 8,11" fill="none" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Minus — panel is open, click to collapse
function FilterMinusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="8" x2="12" y2="8" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

// Plus — panel is collapsed, click to expand
function FilterPlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="8" y1="4" x2="8" y2="12" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
      <line x1="4" y1="8" x2="12" y2="8" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

// ── Type tokens ───────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  letterSpacing: "-0.01em",
  lineHeight: 1.1,
};

const SERIF: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  lineHeight: 1.15,
};

// ── Full index expanded book list ─────────────────────────────────────────────
// Shows all filtered books with 5 columns, fully scrollable.
// Clicking a row drives the side BookDetail panel — no inline expansion.
function FullBookList({
  books,
  hoveredBookId,
  selectedId,
  onHover,
  onSelect,
}: {
  books: Book[];
  hoveredBookId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{ flex: 1, overflowY: "auto", borderTop: "0.5px solid #14141220" }}>
      {/* ── Column headers ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 12px 148px 12px 44px 12px 100px 12px 80px",
        alignItems: "center",
        padding: "0 14px",
        height: 26,
        background: "#c8c8c8",
        position: "sticky",
        top: 0,
        zIndex: 1,
        borderBottom: "0.5px solid #14141222",
      }}>
        {(["TITLE","","AUTHOR","","YEAR","","GENRE","","ORIGIN"]).map((label, i) =>
          label ? (
            <span key={i} style={{ ...MONO, fontSize: 9, letterSpacing: "0.1em", color: "#141412", opacity: 0.45 }}>
              {label}
            </span>
          ) : (
            <span key={i} style={{ ...SERIF, fontSize: 12, color: "#14141233", lineHeight: 0.9, textAlign: "center" }}>|</span>
          )
        )}
      </div>

      {books.map((book) => {
        const isHovered   = hoveredBookId === book.id;
        const isSelected  = selectedId    === book.id;
        return (
          <div key={book.id}>
            {/* ── Row ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 12px 148px 12px 44px 12px 100px 12px 80px",
                alignItems: "center",
                padding: "0 14px",
                height: 26,
                borderTop: "0.5px solid #14141218",
                background: isSelected ? "#b8b8b8" : isHovered ? "#c8c8c8" : "transparent",
                transition: "background 0.1s",
                cursor: "pointer",
              }}
              onMouseEnter={() => onHover(book.id)}
              onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(book.id)}
            >
              <span style={{ ...SERIF, fontSize: 13, color: "#141412", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {book.title}
              </span>
              <span style={{ ...SERIF, fontSize: 14, color: "#14141233", lineHeight: 0.9, textAlign: "center" }}>|</span>
              <span style={{ ...SERIF, fontSize: 13, color: "#141412", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {book.author}
              </span>
              <span style={{ ...SERIF, fontSize: 14, color: "#14141233", lineHeight: 0.9, textAlign: "center" }}>|</span>
              <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap" }}>
                {book.published ? String(book.published).slice(0, 4) : "—"}
              </span>
              <span style={{ ...SERIF, fontSize: 14, color: "#14141233", lineHeight: 0.9, textAlign: "center" }}>|</span>
              <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {book.genre}
              </span>
              <span style={{ ...SERIF, fontSize: 14, color: "#14141233", lineHeight: 0.9, textAlign: "center" }}>|</span>
              <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {book.origin}
              </span>
            </div>

          </div>
        );
      })}
    </div>
  );
}

// ── Index detail side panel ───────────────────────────────────────────────────
// Slides in as a right pane inside the expanded DataPanel when a row is clicked.
// Content cross-fades via GSAP when the selected book changes so the layout
// never jumps. Cover is always the same fixed height regardless of aspect ratio.
function BookDetail({ book, onClose }: { book: Book; onClose: () => void }) {
  // Decouple displayed content from the incoming prop so we can animate between
  const [displayBook, setDisplayBook] = useState<Book>(book);
  const bodyRef  = useRef<HTMLDivElement>(null);
  const animRef  = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    // First mount — no animation needed
    if (!bodyRef.current) { setDisplayBook(book); return; }

    animRef.current?.kill();
    const next = book;

    // Slide outward + fade, then swap content and slide back in
    animRef.current = gsap.to(bodyRef.current, {
      opacity: 0,
      y: 10,
      duration: 0.14,
      ease: "power2.in",
      onComplete: () => {
        setDisplayBook(next);
        gsap.fromTo(
          bodyRef.current!,
          { opacity: 0, y: -10 },
          { opacity: 1, y: 0, duration: 0.22, ease: "power2.out" }
        );
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  return (
    <div style={{
      width: 340, height: "100%",
      display: "flex", flexDirection: "column",
      background: "#cececb",
      overflow: "hidden",
    }}>
      {/* Header — same height as book rows (26px), #2a2a26 distinct from #141412 filter bar */}
      <div style={{
        height: 26, minHeight: 26, maxHeight: 26, flexShrink: 0,
        background: "#2a2a26",
        display: "flex", alignItems: "center",
        padding: "0 0 0 10px",
        justifyContent: "space-between",
        borderLeft: "0.5px solid #e9eae510",
        overflow: "hidden",
      }}>
        <span style={{ ...MONO, fontSize: 9, letterSpacing: "0.1em", color: "#e9eae5", opacity: 0.5 }}>
          SELECTED
        </span>
        {/* × — 26×26 hit target, opacity 0.7 baseline for WCAG visibility on dark bar */}
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#e9eae5", opacity: 0.7,
            width: 26, height: 26, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-sans)", fontSize: 18, lineHeight: 1,
            padding: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.7")}
        >
          ×
        </button>
      </div>

      {/* Scrollable animated body */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "0 0 24px" }}>

        {/* Cover — 320px tall (×2), padded, no crop, always same height */}
        <div style={{
          height: 320, flexShrink: 0,
          background: "#b8b8b4",
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
          marginBottom: 16,
          padding: "18px 24px",
          boxSizing: "border-box",
        }}>
          {displayBook.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayBook.coverUrl} alt={displayBook.title}
              style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            /* Placeholder keeps height stable even with no cover */
            <span style={{ ...MONO, fontSize: 11, color: "#4a4a47", letterSpacing: "0.06em" }}>NO COVER</span>
          )}
        </div>

        <div style={{ padding: "0 16px" }}>
          {/* Title — 18px serif, primary ink, strong enough to anchor the panel */}
          <p style={{ ...SERIF, fontSize: 18, color: "#141412", margin: "0 0 6px", lineHeight: 1.2 }}>
            {displayBook.title}
          </p>

          {/* Author — 13px, #3a3a38 gives ~6:1 contrast on #cececb (passes AA) */}
          <p style={{ ...SERIF, fontSize: 13, color: "#3a3a38", margin: "0 0 12px" }}>
            {displayBook.author}
          </p>

          {/* Hairline separating identity (title/author) from classification (meta) */}
          <div style={{ height: "0.5px", background: "#14141228", marginBottom: 12 }} />

          {/* Meta row — 11px min for readability, #4a4a47 passes AA (5:1 on bg) */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {displayBook.published && (
              <span style={{ ...MONO, fontSize: 11, color: "#4a4a47", letterSpacing: "0.04em" }}>
                {String(displayBook.published).slice(0, 4)}
              </span>
            )}
            {displayBook.genre && (
              <span style={{ ...MONO, fontSize: 11, color: "#4a4a47", letterSpacing: "0.04em" }}>
                {displayBook.genre.toUpperCase()}
              </span>
            )}
            {displayBook.origin && (
              <span style={{ ...MONO, fontSize: 11, color: "#4a4a47", letterSpacing: "0.04em" }}>
                {displayBook.origin.toUpperCase()}
              </span>
            )}
          </div>

          {/* Divider before synopsis */}
          <div style={{ height: "0.5px", background: "#14141228", marginBottom: 14 }} />

          {/* Synopsis — only rendered when present, no empty-state placeholder */}
          {displayBook.brief && (
            <p style={{ ...SERIF, fontSize: 15, color: "#1e1e1c", margin: 0, lineHeight: 1.65 }}>
              {displayBook.brief}
            </p>
          )}

          {/* Quotes */}
          {displayBook.quotes && (
            <>
              <div style={{ height: "0.5px", background: "#14141228", margin: "16px 0 14px" }} />
              <span style={{ ...MONO, fontSize: 11, letterSpacing: "0.08em", color: "#4a4a47", display: "block", marginBottom: 10 }}>
                QUOTES
              </span>
              <p style={{ ...SERIF, fontSize: 15, color: "#2a2a28", margin: 0, lineHeight: 1.7, fontStyle: "italic" }}>
                {displayBook.quotes}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── GSAP split-text helper ────────────────────────────────────────────────────
function splitChars(str: string) {
  return str.split("").map((ch, i) => (
    <span key={i} className="gsap-ch" style={{ display: "inline-block" }}>
      {ch === " " ? "\u00A0" : ch}
    </span>
  ));
}

// ── Hovered book row with GSAP per-character animation ───────────────────────
function HoverRow({ bookId }: { bookId: string | null }) {
  const books = useStore(s => s.books);
  const [activeBook, setActiveBook] = useState<(typeof books)[0] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    const next = bookId ? books.find(b => b.id === bookId) ?? null : null;
    if (!containerRef.current) { setActiveBook(next); return; }

    const chars = Array.from(containerRef.current.querySelectorAll<HTMLElement>(".gsap-ch"));
    animRef.current?.kill();

    if (chars.length === 0) {
      setActiveBook(next);
      return;
    }

    // Exit: each char rotates away on its own axis, staggered
    animRef.current = gsap.to(chars, {
      rotationX: -90,
      opacity: 0,
      y: 4,
      transformOrigin: "50% 50%",
      stagger: { each: 0.018, from: "start" },
      duration: 0.18,
      ease: "power2.in",
      onComplete: () => setActiveBook(next),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chars = Array.from(containerRef.current.querySelectorAll<HTMLElement>(".gsap-ch"));
    animRef.current?.kill();
    if (chars.length === 0) return;

    // Enter: chars drop in rotating from above, staggered left→right
    gsap.fromTo(chars,
      { rotationX: 90, opacity: 0, y: -6, transformOrigin: "50% 50%" },
      {
        rotationX: 0, opacity: 1, y: 0,
        stagger: { each: 0.022, from: "start" },
        duration: 0.24,
        ease: "back.out(1.4)",
      }
    );
  }, [activeBook]);

  // Same grid as BookList rows — structure is static, only text animates
  return (
    <div
      ref={containerRef}
      style={{
        background: "#838383",
        borderTop: "0.5px solid #e9eae522",
        display: "grid",
        gridTemplateColumns: "1fr 12px 148px 12px 52px",
        alignItems: "center",
        padding: "0 8px",
        height: 26,
        overflow: "hidden",
        perspective: 400,
      }}
    >
      {/* Title */}
      <div style={{ overflow: "hidden", minWidth: 0 }}>
        <span style={{
          ...SERIF, fontSize: 13, color: "#e9eae5",
          whiteSpace: "nowrap", display: "block",
          textOverflow: "ellipsis", overflow: "hidden",
        }}>
          {activeBook ? splitChars(activeBook.title) : (
            <span style={{ opacity: 0.35, fontStyle: "italic" }}>hover a book</span>
          )}
        </span>
      </div>

      {/* Fixed pipe */}
      <span style={{ ...SERIF, fontSize: 14, color: "#e9eae533", lineHeight: 0.9, textAlign: "center" }}>|</span>

      {/* Author */}
      <div style={{ overflow: "hidden", minWidth: 0 }}>
        <span style={{
          ...SERIF, fontSize: 13, color: "#e9eae5",
          whiteSpace: "nowrap", display: "block",
          textOverflow: "ellipsis", overflow: "hidden",
        }}>
          {activeBook ? splitChars(activeBook.author) : ""}
        </span>
      </div>

      {/* Fixed pipe */}
      <span style={{ ...SERIF, fontSize: 14, color: "#e9eae533", lineHeight: 0.9, textAlign: "center" }}>|</span>

      {/* Year */}
      <span style={{ ...SERIF, fontSize: 13, color: "#e9eae5", opacity: 0.65, whiteSpace: "nowrap" }}>
        {activeBook ? splitChars(activeBook.published ? String(activeBook.published).slice(0, 4) : "—") : ""}
      </span>
    </div>
  );
}

// ── Departures-board book list ────────────────────────────────────────────────
// Structural skeleton (borders + column dividers) is always fixed.
// Only the text content inside each slot animates on window shift.
function BookList({
  books,
  windowStart,
  hoveredBookId,
  onHover,
  onSelect,
}: {
  books: Book[];
  windowStart: number;
  hoveredBookId: string | null;
  onHover: (id: string | null) => void;
  onSelect?: (id: string) => void;
}) {
  const windowedBooks = books.slice(windowStart, windowStart + WINDOW_SIZE);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevWindowStart = useRef(windowStart);

  useEffect(() => {
    if (!containerRef.current) return;
    if (prevWindowStart.current === windowStart) return;

    const dir = windowStart > prevWindowStart.current ? 1 : -1;
    prevWindowStart.current = windowStart;

    // Only animate the text spans — structural lines (borders + pipes) stay put
    const texts = Array.from(containerRef.current.querySelectorAll<HTMLElement>(".slot-text"));
    if (texts.length === 0) return;

    gsap.fromTo(texts,
      { y: dir * 9, opacity: 0 },
      {
        y: 0, opacity: 1,
        stagger: { each: 0.018, from: dir === 1 ? "start" : "end" },
        duration: 0.2,
        ease: "power2.out",
      }
    );
  }, [windowStart]);

  return (
    // Fixed skeleton: WINDOW_SIZE slots, each with a stable key = slot index
    <div ref={containerRef}>
      {Array.from({ length: WINDOW_SIZE }, (_, i) => {
        const book = windowedBooks[i] ?? null;
        return (
          <div
            key={i}
            style={{
              borderTop: "0.5px solid #141412",
              display: "grid",
              gridTemplateColumns: "1fr 12px 148px 12px 52px",
              alignItems: "center",
              padding: "0 8px",
              height: 26,
              background: book && hoveredBookId === book.id ? "#c8c8c8" : "transparent",
              transition: "background 0.12s",
              cursor: book && onSelect ? "pointer" : "default",
            }}
            onMouseEnter={() => book && onHover(book.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => book && onSelect?.(book.id)}
          >
            {/* Title */}
            <div style={{ overflow: "hidden", minWidth: 0 }}>
              <span className="slot-text" style={{
                ...SERIF, fontSize: 13, color: "#141412",
                whiteSpace: "nowrap", display: "block",
                textOverflow: "ellipsis", overflow: "hidden",
              }}>
                {book?.title ?? ""}
              </span>
            </div>

            {/* Fixed pipe separator */}
            <span style={{ ...SERIF, fontSize: 14, color: "#14141244", lineHeight: 0.9, textAlign: "center" }}>|</span>

            {/* Author */}
            <div style={{ overflow: "hidden", minWidth: 0 }}>
              <span className="slot-text" style={{
                ...SERIF, fontSize: 13, color: "#141412",
                whiteSpace: "nowrap", display: "block",
                textOverflow: "ellipsis", overflow: "hidden",
              }}>
                {book?.author ?? ""}
              </span>
            </div>

            {/* Fixed pipe separator */}
            <span style={{ ...SERIF, fontSize: 14, color: "#14141244", lineHeight: 0.9, textAlign: "center" }}>|</span>

            {/* Year */}
            <span className="slot-text" style={{
              ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap",
            }}>
              {book ? (book.published ? String(book.published).slice(0, 4) : "—") : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main DataPanel ─────────────────────────────────────────────────────────────
export function DataPanel() {
  const filteredBooks     = useStore(s => s.filteredBooks);
  const filters           = useStore(s => s.filters);
  const setFilter         = useStore(s => s.setFilter);
  const clearFilters      = useStore(s => s.clearFilters);
  const hoveredBookId     = useStore(s => s.hoveredBookId);
  const setHoveredBookId  = useStore(s => s.setHoveredBookId);
  const shelfScrollIndex  = useStore(s => s.shelfScrollIndex);
  const activeView        = useStore(s => s.activeView);
  const setActiveView     = useStore(s => s.setActiveView);
  const setSelectedBookId = useStore(s => s.setSelectedBookId);

  const [minimized, setMinimized] = useState(false);
  const entranceRef = useRef<HTMLDivElement>(null);

  // ── Entrance animation — slides in from right on first mount ─────────────
  useLayoutEffect(() => {
    if (!entranceRef.current) return;
    gsap.fromTo(entranceRef.current,
      { x: 20, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.6, ease: "power3.out", delay: 0.16 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-minimize when data view is active, restore when leaving
  useEffect(() => {
    if (activeView === 'data') {
      setMinimized(true);
    } else {
      setMinimized(false);
    }
  }, [activeView]);

  // Debounced scroll index — book list only refreshes after 280ms of no scrolling
  // so it doesn't jitter during fast scrolls. Counter uses live value.
  const [stableScrollIndex, setStableScrollIndex] = useState(shelfScrollIndex);
  useEffect(() => {
    const t = setTimeout(() => setStableScrollIndex(shelfScrollIndex), 280);
    return () => clearTimeout(t);
  }, [shelfScrollIndex]);

  // Genre filter — mouse-drag scroll
  const filterRowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const onFilterMouseDown = useCallback((e: React.MouseEvent) => {
    if (!filterRowRef.current) return;
    dragRef.current = { active: true, startX: e.pageX, scrollLeft: filterRowRef.current.scrollLeft };
    filterRowRef.current.style.cursor = "grabbing";
  }, []);

  const onFilterMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current.active || !filterRowRef.current) return;
    e.preventDefault();
    const dx = e.pageX - dragRef.current.startX;
    filterRowRef.current.scrollLeft = dragRef.current.scrollLeft - dx;
  }, []);

  const onFilterMouseUp = useCallback(() => {
    if (!filterRowRef.current) return;
    dragRef.current.active = false;
    filterRowRef.current.style.cursor = "grab";
  }, []);

  const toggleGenre = useCallback((genre: string) => {
    // Only toggle if not dragging
    if (dragRef.current.active) return;
    const current = filters.genre;
    setFilter(
      'genre',
      current.includes(genre)
        ? current.filter(g => g !== genre)
        : [...current, genre]
    );
  }, [filters.genre, setFilter]);

  const anyGenreActive = filters.genre.length > 0;
  const isExpanded = activeView === "index";

  // Live viewport — pixel values give clean number↔number interpolation.
  const [vpH, setVpH] = useState(() => typeof window !== "undefined" ? window.innerHeight : 900);
  const [vpW, setVpW] = useState(() => typeof window !== "undefined" ? window.innerWidth  : 1440);
  useEffect(() => {
    const onResize = () => { setVpH(window.innerHeight); setVpW(window.innerWidth); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Body state machine ────────────────────────────────────────────────────
  // Only ONE body is ever rendered. We fade it out, swap the content, fade in.
  // This eliminates the "both bodies in DOM" problem that caused visible
  // bleed-through, stale GSAP animations, and interactive ghost rows.
  const [bodyMode, setBodyMode]       = useState<"compact" | "full">("compact");
  const [bodyVisible, setBodyVisible] = useState(true);
  const fullBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (isExpanded) {
      // Expand: fade out compact, wait for it to disappear, then reveal full list
      // (panel is already growing — full list appears into the widening space)
      setBodyVisible(false);
      t = setTimeout(() => { setBodyMode("full"); setBodyVisible(true); }, 140);
    } else {
      // Collapse: reset scroll, fade out full list, swap to compact quickly.
      // 80ms is enough for the opacity fade (0.13s) to be mostly done, and the
      // compact content then fades in while the panel is still contracting —
      // the panel wraps down around the compact rows rather than collapsing on
      // empty space. Feels like the true reverse of the expand.
      if (fullBodyRef.current) fullBodyRef.current.scrollTop = 0;
      setIndexSelectedId(null);
      setBodyVisible(false);
      t = setTimeout(() => { setBodyMode("compact"); setBodyVisible(true); }, 80);
    }
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded]);

  // Local scroll index for compact list — independent of shelf scroll
  const [compactIdx, setCompactIdx] = useState(0);

  const handleListWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setCompactIdx(prev =>
      Math.max(0, Math.min(prev + (e.deltaY > 0 ? 1 : -1), Math.max(0, filteredBooks.length - WINDOW_SIZE)))
    );
  }, [filteredBooks.length]);

  // Wheel on carousel → scroll it horizontally
  const handleCarouselWheel = useCallback((e: React.WheelEvent) => {
    if (!filterRowRef.current) return;
    e.preventDefault();
    filterRowRef.current.scrollBy({ left: e.deltaY * 0.8, behavior: "auto" });
  }, []);

  // Compute the windowed book list start — shelf view follows the 3D scroll,
  // other views use the local wheel-driven compactIdx
  const windowStart = useMemo(() => {
    if (activeView === 'shelf') {
      return Math.max(0, Math.min(
        Math.round(stableScrollIndex - WINDOW_SIZE / 2),
        Math.max(0, filteredBooks.length - WINDOW_SIZE)
      ));
    }
    return compactIdx;
  }, [activeView, stableScrollIndex, compactIdx, filteredBooks.length]);

  const [indexSelectedId, setIndexSelectedId] = useState<string | null>(null);
  const handleFullIndexSelect = useCallback((id: string) => {
    setIndexSelectedId(prev => prev === id ? null : id);
  }, []);

  // Resolved book for the detail pane — null when nothing selected
  const indexSelectedBook = useMemo(() =>
    indexSelectedId ? (filteredBooks.find(b => b.id === indexSelectedId) ?? null) : null,
    [indexSelectedId, filteredBooks]
  );

  // Panel dimensions — pure pixel values for clean CSS interpolation
  const FILTER_H  = 26;
  const COMPACT_H = FILTER_H + 26 + WINDOW_SIZE * 26; // 364
  const panelH = isExpanded ? vpH - 20 : minimized ? FILTER_H : COMPACT_H;
  const panelW = isExpanded ? Math.max(558, vpW - 460) : 558;

  const EASE = "cubic-bezier(0.4,0,0.2,1)";

  return (
    <>
      {/* ── Blur backdrop — full viewport, behind panel, above canvas ──
          pointerEvents: auto when expanded so the canvas cannot be clicked
          or hovered through it — prevents the 3D shelf from triggering
          hover states and the BookOverlay from opening mid-index.          ── */}
      <div
        style={{
          position: "fixed", inset: 0,
          zIndex: 29,
          backdropFilter: isExpanded ? "blur(6px)" : "blur(0px)",
          background: isExpanded ? "rgba(220,220,215,0.28)" : "rgba(220,220,215,0)",
          pointerEvents: isExpanded ? "auto" : "none",
          transition: `backdrop-filter 0.42s ${EASE}, background 0.42s ${EASE}`,
          cursor: isExpanded ? "pointer" : "default",
        }}
        onClick={isExpanded ? () => setActiveView("shelf") : undefined}
      />

    <div ref={entranceRef} style={{
      position: "fixed",
      top: 20,
      right: 20,
      zIndex: 30,
      pointerEvents: "none",
    }}>
      {/* ── Panel — single element, width + height both animate ── */}
      <div style={{
        width: panelW,
        height: panelH,
        background: "#d9d9d9",
        borderRadius: 8,
        pointerEvents: "auto",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: `width 0.42s ${EASE}, height 0.44s ${EASE}`,
      }}>

        {/* ── Genre filter row — always visible, fixed height ── */}
        <div style={{
          height: FILTER_H,
          flexShrink: 0,
          background: "#141412",
          borderTop: "0.5px solid #e9eae522",
          display: "flex",
          alignItems: "center",
          userSelect: "none",
        }}>
          {/* Left arrow */}
          <button
            onClick={() => filterRowRef.current?.scrollBy({ left: -140, behavior: "smooth" })}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center",
              padding: "0 4px 0 10px", background: "none", border: "none",
              cursor: "pointer", opacity: 0.5, transition: `opacity 0.15s`,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
          >
            <FilterLeftArrow />
          </button>

          {/* Right arrow */}
          <button
            onClick={() => filterRowRef.current?.scrollBy({ left: 140, behavior: "smooth" })}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center",
              padding: "0 6px 0 0", background: "none", border: "none",
              cursor: "pointer", opacity: 0.5, transition: `opacity 0.15s`,
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
          >
            <FilterRightArrow />
          </button>

          {/* Clear filters — only visible when a genre is active */}
          <button
            onClick={clearFilters}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center",
              padding: "0 8px 0 2px", background: "none", border: "none",
              cursor: "pointer", transition: `opacity 0.2s`,
              opacity: anyGenreActive ? 0.6 : 0,
              pointerEvents: anyGenreActive ? "auto" : "none",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = anyGenreActive ? "0.6" : "0")}
            title="Clear all filters"
          >
            <span style={{ ...MONO, fontSize: 9, letterSpacing: "0.08em", color: "#e9eae5", lineHeight: 1 }}>
              CLEAR
            </span>
          </button>

          {/* Scrollable genre labels */}
          <div
            ref={filterRowRef}
            onMouseDown={onFilterMouseDown}
            onMouseMove={onFilterMouseMove}
            onMouseUp={onFilterMouseUp}
            onMouseLeave={onFilterMouseUp}
            onWheel={handleCarouselWheel}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "3px 0", overflowX: "auto", scrollbarWidth: "none",
              cursor: "grab", flex: 1, minWidth: 0,
            }}
          >
            {GENRES.map((genre, i) => {
              const active = filters.genre.includes(genre);
              const dimmed = anyGenreActive && !active;
              return (
                <span key={genre} style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  {i > 0 && (
                    <span style={{ ...MONO, color: "#e9eae5", opacity: 0.2, lineHeight: 0.9 }}>|</span>
                  )}
                  <button
                    onClick={() => toggleGenre(genre)}
                    style={{
                      ...MONO, color: "#e9eae5", whiteSpace: "nowrap",
                      textDecoration: dimmed ? "line-through" : "none",
                      opacity: dimmed ? 0.35 : 1, flexShrink: 0,
                      cursor: "pointer", background: "none", border: "none",
                      padding: "1px 0", transition: `opacity 0.15s`,
                    }}
                  >
                    {genre.toUpperCase()}
                  </button>
                </span>
              );
            })}
          </div>

          {/* Minimize — hidden in expanded mode */}
          {!isExpanded && (
            <button
              onClick={() => setMinimized(m => !m)}
              style={{
                flexShrink: 0, display: "flex", alignItems: "center",
                padding: "0 10px", background: "none", border: "none",
                cursor: "pointer", opacity: minimized ? 1 : 0.5,
                transition: `opacity 0.15s`,
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={e => (e.currentTarget.style.opacity = minimized ? "1" : "0.5")}
            >
              {minimized ? <FilterPlusIcon /> : <FilterMinusIcon />}
            </button>
          )}
        </div>

        {/* ── Body — one mode at a time, fades between them ── */}
        <div style={{
          flex: 1, minHeight: 0,
          opacity: bodyVisible ? 1 : 0,
          transition: `opacity 0.13s ${EASE}`,
          overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}>
          {bodyMode === "full" ? (
            // ── Two-pane layout: scrollable list + animated detail side panel ──
            <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>

              {/* Left: scrollable full book list */}
              <div ref={fullBodyRef} style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
                <FullBookList
                  books={filteredBooks}
                  hoveredBookId={hoveredBookId}
                  selectedId={indexSelectedId}
                  onHover={setHoveredBookId}
                  onSelect={handleFullIndexSelect}
                />
              </div>

              {/* Right: detail pane — width slides from 0 → 260 on selection */}
              <div style={{
                width: indexSelectedId ? 340 : 0,
                flexShrink: 0,
                overflow: "hidden",
                transition: `width 0.35s ${EASE}`,
              }}>
                {indexSelectedBook && (
                  <BookDetail
                    book={indexSelectedBook}
                    onClose={() => setIndexSelectedId(null)}
                  />
                )}
              </div>

            </div>
          ) : (
            <div onWheel={handleListWheel} style={{ display: "flex", flexDirection: "column" }}>
              <HoverRow bookId={hoveredBookId} />
              <BookList
                books={filteredBooks}
                windowStart={windowStart}
                hoveredBookId={hoveredBookId}
                onHover={setHoveredBookId}
                onSelect={setSelectedBookId}
              />
            </div>
          )}
        </div>

      </div>
    </div>
    </>
  );
}
