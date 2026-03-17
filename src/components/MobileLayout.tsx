"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useStore } from "@/store";
import { ShelfView }  from "./ShelfView";
import { BookOverlay } from "./BookOverlay";
import { DataView }   from "./DataView";
import { GENRE_COLORS } from "@/lib/genreColor";

const GENRES       = Object.keys(GENRE_COLORS);
const MOBILE_ROWS  = 5;

// ── Type tokens ───────────────────────────────────────────────────────────────
const MONO: React.CSSProperties = {
  fontFamily:    "var(--font-sans)",
  fontSize:      11,
  letterSpacing: "-0.01em",
  lineHeight:    1.1,
};

const SERIF: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  lineHeight: 1.15,
};

// ── BB logotype — white-filled, scaled for mobile nav ─────────────────────────
function BBLogoMini() {
  return (
    <svg
      width="14" height="23"
      viewBox="0 0 29 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path
        fillRule="evenodd" clipRule="evenodd"
        d="M0.510742 0C1.23531 0 2.12912 0.0429115 2.97852 0.0849609C3.82848 0.127039 4.63549 0.168922 5.18945 0.168945H10.9102C13.3713 0.168953 15.4256 0.708461 16.8652 1.81738C18.3064 2.92792 19.1278 4.60692 19.1279 6.87207C19.1277 10.6298 16.2828 12.7967 14.0791 13.1357C13.9777 13.1527 13.9093 13.1702 13.8662 13.1953C13.8461 13.2071 13.8326 13.2203 13.8242 13.2354C13.8157 13.2506 13.8106 13.2714 13.8105 13.2998C13.8106 13.3341 13.8268 13.3645 13.8662 13.3877C13.9081 13.4121 13.9762 13.4277 14.0732 13.4277H14.0771V13.4287C17.6275 13.7331 20.3728 16.2375 20.373 19.8955C20.373 20.2281 20.3555 20.5479 20.3223 20.8545C22.3932 20.9705 24.1316 21.5057 25.3955 22.4795C26.8364 23.59 27.6571 25.2683 27.6572 27.5332C27.6572 31.1738 24.9877 33.3218 22.8174 33.7607L22.6094 33.7979C22.5076 33.8148 22.4387 33.8313 22.3955 33.8564C22.3754 33.8682 22.3619 33.8815 22.3535 33.8965C22.345 33.9117 22.3399 33.9326 22.3398 33.9609C22.3398 33.9953 22.3561 34.0256 22.3955 34.0488C22.4374 34.0733 22.5063 34.0898 22.6035 34.0898H22.6064L22.9365 34.125C26.3255 34.5519 28.9019 37.013 28.9023 40.5566C28.9023 43.2282 27.8016 45.0504 26.0273 46.2021C24.2557 47.3521 21.8156 47.832 19.1367 47.832H13.7188C13.1479 47.8321 12.341 47.8739 11.4951 47.916C10.65 47.9581 9.76553 48.001 9.04102 48.001C8.87283 48.0009 8.74417 47.9842 8.6582 47.9316C8.5671 47.8757 8.53031 47.7839 8.53027 47.6582C8.53032 47.6037 8.53879 47.5543 8.55957 47.5127C8.58061 47.4708 8.61274 47.4376 8.6543 47.4131C8.7355 47.3653 8.85484 47.3497 9.00684 47.3496C10.1167 47.3496 10.9707 47.214 11.5479 46.7275C12.1233 46.2425 12.4336 45.3989 12.4336 43.9561V27.0889C11.8415 27.1432 11.2308 27.1709 10.6074 27.1709H5.18945C4.61865 27.1709 3.81159 27.2128 2.96582 27.2549C2.12062 27.2969 1.23533 27.3389 0.510742 27.3389C0.342983 27.3388 0.214795 27.3228 0.128906 27.2705C0.0377402 27.2145 0 27.1219 0 26.9961C9.3939e-05 26.9417 0.00957594 26.893 0.0302734 26.8516C0.0513037 26.8096 0.0834101 26.7765 0.125 26.752C0.206244 26.7042 0.325441 26.6875 0.477539 26.6875C1.58737 26.6875 2.44136 26.5529 3.01855 26.0664C3.59399 25.5814 3.90425 24.7376 3.9043 23.2949V3.78125C3.88188 2.49825 3.57441 1.72813 3.03125 1.27344C2.44983 0.787207 1.58709 0.651368 0.477539 0.651367C0.325441 0.651333 0.206244 0.634704 0.125 0.586914C0.0837458 0.562461 0.0511963 0.529994 0.0302734 0.488281C0.0096317 0.446724 0 0.397261 0 0.342773V0.336914L0.0400391 0.342773L0.000976562 0.336914C0.018435 0.215443 0.0551153 0.125762 0.140625 0.0703125C0.222659 0.0172317 0.342839 6.06824e-05 0.510742 0ZM9.96777 0.786133C9.19319 0.786162 8.63265 0.85424 8.26562 1.11523C7.90284 1.37333 7.71882 1.82938 7.71875 2.63184V11.7178C7.71875 11.9831 7.75826 12.1978 7.84375 12.3701C7.92896 12.5415 8.06221 12.6747 8.25293 12.7764C8.63853 12.9815 9.26073 13.0576 10.2031 13.0576C11.5721 13.0576 12.866 12.5157 13.8174 11.4893C14.7687 10.4628 15.3799 8.94928 15.3799 7.00586C15.3795 3.18838 12.9039 0.786133 9.96777 0.786133ZM10.2373 13.5078C9.27738 13.5078 8.64725 13.575 8.25781 13.7881C8.0652 13.8936 7.93183 14.0355 7.8457 14.2227C7.75915 14.4109 7.71882 14.6487 7.71875 14.9482V24.4053C7.71877 25.3597 7.92925 25.8917 8.30566 26.1875C8.68493 26.485 9.24423 26.5527 9.96777 26.5527C10.8126 26.5527 11.6519 26.4498 12.4336 26.2148V14.9482C12.4336 14.6487 12.3933 14.4109 12.3057 14.2227C12.2196 14.0355 12.086 13.8936 11.8945 13.7881C11.5039 13.575 10.8726 13.5078 9.91211 13.5078H10.2373ZM18.7666 34.1689C17.8066 34.169 17.1765 34.237 16.7871 34.4502C16.5947 34.5556 16.4611 34.6968 16.375 34.8838C16.2884 35.0721 16.2481 35.3107 16.248 35.6104V45.0664C16.248 46.0209 16.4585 46.5528 16.835 46.8486C17.2142 47.1463 17.7734 47.2148 18.4971 47.2148C20.1574 47.2148 21.7966 46.8204 23.0195 45.7979C24.2412 44.7763 25.0537 43.1225 25.0537 40.5908C25.0536 38.2812 24.1254 36.6767 22.877 35.6494C21.627 34.6213 20.0538 34.169 18.7666 34.1689ZM20.1758 21.7256C19.7856 23.4276 18.8331 24.6733 17.498 25.54C17.112 25.7907 16.6932 26.0073 16.248 26.1963V32.3789C16.248 32.6442 16.2885 32.8589 16.374 33.0312C16.4593 33.2028 16.5923 33.3368 16.7832 33.4385C17.1688 33.6434 17.7905 33.7197 18.7324 33.7197C20.1015 33.7197 21.3953 33.1769 22.3467 32.1504C23.298 31.1239 23.9092 29.6113 23.9092 27.668C23.909 24.6083 22.3188 22.4589 20.1758 21.7256Z"
        fill="#e9eae5"
      />
    </svg>
  );
}

// ── Mini arrow icons for genre strip scroll ────────────────────────────────────
function ArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <line x1="12" y1="8" x2="4.5" y2="8" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
      <polyline points="8,5 4.5,8 8,11" fill="none" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <line x1="4" y1="8" x2="11.5" y2="8" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
      <polyline points="8,5 11.5,8 8,11" fill="none" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Plus — list is collapsed
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <line x1="8" y1="4" x2="8" y2="12" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
      <line x1="4" y1="8" x2="12" y2="8" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

// Minus — list is visible
function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <line x1="4" y1="8" x2="12" y2="8" stroke="#e9eae5" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}

// ── Full-screen scrollable index list for mobile ───────────────────────────────
function MobileIndexList() {
  const filteredBooks     = useStore(s => s.filteredBooks);
  const setSelectedBookId = useStore(s => s.setSelectedBookId);

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#d9d9d9", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>

      {/* Sticky column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 10px clamp(80px, 28vw, 140px) 10px 42px",
        alignItems: "center",
        padding: "0 14px",
        height: 34,
        background: "#c8c8c8",
        position: "sticky", top: 0, zIndex: 1,
        borderBottom: "0.5px solid #14141222",
      }}>
        {["TITLE", "", "AUTHOR", "", "YEAR"].map((label, i) =>
          label ? (
            <span key={i} style={{ ...MONO, fontSize: 9, letterSpacing: "0.1em", color: "#141412", opacity: 0.45 }}>
              {label}
            </span>
          ) : (
            <span key={i} style={{ ...SERIF, fontSize: 12, color: "#14141233", lineHeight: 0.9, textAlign: "center" }}>|</span>
          )
        )}
      </div>

      {filteredBooks.map(book => (
        <div
          key={book.id}
          role="button"
          tabIndex={0}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 10px clamp(80px, 28vw, 140px) 10px 42px",
            alignItems: "center",
            padding: "0 14px",
            height: 48,
            borderTop: "0.5px solid #14141218",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            outline: "none",
          }}
          onClick={() => setSelectedBookId(book.id)}
          onKeyDown={e => e.key === "Enter" && setSelectedBookId(book.id)}
        >
          <span style={{ ...SERIF, fontSize: 13, color: "#141412", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {book.title}
          </span>
          <span style={{ ...SERIF, fontSize: 14, color: "#14141233", lineHeight: 0.9, textAlign: "center" }}>|</span>
          <span style={{ ...SERIF, fontSize: 12, color: "#141412", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: 0.65 }}>
            {book.author}
          </span>
          <span style={{ ...SERIF, fontSize: 14, color: "#14141233", lineHeight: 0.9, textAlign: "center" }}>|</span>
          <span style={{ ...SERIF, fontSize: 12, color: "#838383", whiteSpace: "nowrap" }}>
            {book.published ? String(book.published).slice(0, 4) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main mobile layout ────────────────────────────────────────────────────────
export function MobileLayout() {
  const activeView        = useStore(s => s.activeView);
  const setActiveView     = useStore(s => s.setActiveView);
  const filteredBooks     = useStore(s => s.filteredBooks);
  const booksLength       = useStore(s => s.books.length);
  const shelfScrollIndex  = useStore(s => s.shelfScrollIndex);
  const selectedBookId    = useStore(s => s.selectedBookId);
  const setSelectedBookId = useStore(s => s.setSelectedBookId);
  const filters           = useStore(s => s.filters);
  const setFilter         = useStore(s => s.setFilter);

  // Genre strip ref for arrow-scroll
  const filterRowRef = useRef<HTMLDivElement>(null);

  // Whether compact book list is user-minimized
  const [listMinimized, setListMinimized] = useState(false);

  // Debounce list updates — same pattern as DataPanel compact view
  const [stableIdx, setStableIdx] = useState(shelfScrollIndex);
  useEffect(() => {
    const t = setTimeout(() => setStableIdx(shelfScrollIndex), 200);
    return () => clearTimeout(t);
  }, [shelfScrollIndex]);

  // Centre the list window on the current shelf position
  const windowStart = useMemo(() => Math.max(
    0, Math.min(
      Math.round(stableIdx - Math.floor(MOBILE_ROWS / 2)),
      Math.max(0, filteredBooks.length - MOBILE_ROWS)
    )
  ), [stableIdx, filteredBooks.length]);

  const windowedBooks  = filteredBooks.slice(windowStart, windowStart + MOBILE_ROWS);
  const anyGenreActive = filters.genre.length > 0;

  const toggleGenre = useCallback((genre: string) => {
    const current = filters.genre;
    setFilter(
      "genre",
      current.includes(genre)
        ? current.filter(g => g !== genre)
        : [...current, genre]
    );
  }, [filters.genre, setFilter]);

  // The compact list is hidden when:
  //  • user explicitly minimized it, OR
  //  • a book is selected (give canvas full height for the 3D cover)
  const showList = activeView === "shelf" && !listMinimized && !selectedBookId;

  // Live position counter for shelf view
  const displayIndex = filteredBooks.length > 0 ? stableIdx + 1 : 0;

  const EASE = "cubic-bezier(0.4,0,0.2,1)";

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      height: "100svh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      background: "#E6E6E6",
    }}>

      {/* ── TOP NAV — tabs + logo + counter ─────────────────────────────── */}
      {/* Slightly darker than the genre strip so the two rows read as distinct */}
      <div style={{
        flexShrink: 0,
        height: "clamp(44px, 7svh, 58px)",
        background: "#141412",
        display: "flex",
        alignItems: "center",
        padding: "0 14px",
        gap: 8,
        userSelect: "none",
        borderBottom: "0.5px solid #ffffff0a",
      }}>
        <BBLogoMini />

        {/* Position counter — shows current book index in shelf view,
            total count in index view */}
        <span style={{
          ...MONO,
          fontSize: 10,
          letterSpacing: "0.04em",
          color: "#e9eae5",
          opacity: 0.5,
          flexShrink: 0,
          minWidth: 36,
        }}>
          {activeView === "shelf"
            ? `${displayIndex}/${filteredBooks.length}`
            : `${filteredBooks.length}/${booksLength}`}
        </span>

        <div style={{ width: 1, height: 14, background: "#e9eae525", flexShrink: 0, marginLeft: 2 }} />

        {/* View tabs */}
        {(["shelf", "index", "data"] as const).map(view => {
          const labels: Record<string, string> = { shelf: "SHELF", index: "INDEX", data: "DATA" };
          const active = activeView === view;
          return (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              style={{
                ...MONO,
                fontSize: 10,
                letterSpacing: "0.08em",
                color: "#e9eae5",
                background: "none",
                border: active ? "1px solid #e9eae530" : "1px solid transparent",
                borderRadius: 6,
                padding: "4px 8px",
                cursor: "pointer",
                opacity: active ? 1 : 0.4,
                flexShrink: 0,
                transition: "opacity 0.15s, border-color 0.15s",
                WebkitTapHighlightColor: "transparent",
                outline: "none",
              }}
            >
              {labels[view]}
            </button>
          );
        })}
      </div>

      {/* ── GENRE FILTER STRIP — arrows + scrollable chips + minimize ─── */}
      {/* Slightly lighter than nav to create a readable two-tier header */}
      <div style={{
        flexShrink: 0,
        height: "clamp(30px, 4svh, 38px)",
        background: "#1e1e1c",
        display: "flex",
        alignItems: "center",
        borderBottom: "0.5px solid #ffffff08",
        userSelect: "none",
      }}>
        {/* Left arrow */}
        <button
          onClick={() => filterRowRef.current?.scrollBy({ left: -120, behavior: "smooth" })}
          style={{
            flexShrink: 0, display: "flex", alignItems: "center",
            padding: "0 6px 0 10px", background: "none", border: "none",
            cursor: "pointer", opacity: 0.5,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <ArrowLeft />
        </button>

        {/* Right arrow */}
        <button
          onClick={() => filterRowRef.current?.scrollBy({ left: 120, behavior: "smooth" })}
          style={{
            flexShrink: 0, display: "flex", alignItems: "center",
            padding: "0 6px 0 0", background: "none", border: "none",
            cursor: "pointer", opacity: 0.5,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <ArrowRight />
        </button>

        {/* Scrollable genre chips */}
        <div
          ref={filterRowRef}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            overflowX: "auto",
            scrollbarWidth: "none",
            gap: 0,
            padding: "2px 0",
          }}
        >
          {GENRES.map((genre, i) => {
            const active = filters.genre.includes(genre);
            const dimmed = anyGenreActive && !active;
            return (
              <span key={genre} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                {i > 0 && (
                  <span style={{ ...MONO, color: "#e9eae5", opacity: 0.18, lineHeight: 0.9, padding: "0 8px" }}>|</span>
                )}
                <button
                  onClick={() => toggleGenre(genre)}
                  style={{
                    ...MONO,
                    fontSize: 10,
                    letterSpacing: "0.07em",
                    color: "#e9eae5",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    opacity: dimmed ? 0.28 : active ? 1 : 0.7,
                    textDecoration: dimmed ? "line-through" : "none",
                    padding: "5px 0",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    WebkitTapHighlightColor: "transparent",
                    outline: "none",
                  }}
                >
                  {genre.toUpperCase()}
                </button>
              </span>
            );
          })}
        </div>

        {/* Minimize/expand the compact list — only in shelf view */}
        {activeView === "shelf" && !selectedBookId && (
          <button
            onClick={() => setListMinimized(m => !m)}
            style={{
              flexShrink: 0, display: "flex", alignItems: "center",
              padding: "0 10px", background: "none", border: "none",
              cursor: "pointer",
              opacity: listMinimized ? 1 : 0.5,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {listMinimized ? <PlusIcon /> : <MinusIcon />}
          </button>
        )}
      </div>

      {/* ── COMPACT DEPARTURES BOARD ─────────────────────────────────────
          Hidden when minimized or when a book is selected (canvas gets full
          height so the 3D cover isn't tiny).                              ── */}
      {showList && (
        <div style={{
          flexShrink: 0,
          background: "#d9d9d9",
          borderBottom: "0.5px solid #14141215",
          transition: `opacity 0.18s ${EASE}`,
        }}>
          {Array.from({ length: MOBILE_ROWS }, (_, i) => {
            const book = windowedBooks[i] ?? null;
            return (
              <div
                key={i}
                role={book ? "button" : undefined}
                tabIndex={book ? 0 : undefined}
                style={{
                  height: "clamp(26px, 4svh, 38px)",
                  display: "grid",
                  gridTemplateColumns: "1fr 10px clamp(72px, 25vw, 130px) 10px 38px",
                  alignItems: "center",
                  padding: "0 14px",
                  borderTop: i === 0 ? "none" : "0.5px solid #14141215",
                  cursor: book ? "pointer" : "default",
                  WebkitTapHighlightColor: "transparent",
                  outline: "none",
                }}
                onClick={() => book && setSelectedBookId(book.id)}
                onKeyDown={e => e.key === "Enter" && book && setSelectedBookId(book.id)}
              >
                <span style={{ ...SERIF, fontSize: 13, color: "#141412", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {book?.title ?? ""}
                </span>
                <span style={{ ...SERIF, fontSize: 13, color: "#14141230", lineHeight: 0.9, textAlign: "center" }}>|</span>
                <span style={{ ...SERIF, fontSize: 12, color: "#141412", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: 0.55 }}>
                  {book?.author ?? ""}
                </span>
                <span style={{ ...SERIF, fontSize: 13, color: "#14141230", lineHeight: 0.9, textAlign: "center" }}>|</span>
                <span style={{ ...SERIF, fontSize: 12, color: "#838383", whiteSpace: "nowrap" }}>
                  {book ? (book.published ? String(book.published).slice(0, 4) : "—") : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 3-D SHELF CANVAS ─────────────────────────────────────────────
          flex:1 means it expands to fill all remaining viewport height.
          When a book is selected the compact list hides, giving the canvas
          extra height so the 3D cover isn't tiny.                        ── */}
      {activeView === "shelf" && (
        // position:relative is critical — ShelfView's inner canvas container uses
        // `absolute inset-0` and without a positioned ancestor it would stretch to
        // the MobileLayout `position:fixed` root, making the canvas full-screen and
        // breaking book sizing + bottom-alignment.
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative" }}>
          <ShelfView mobileMode />
        </div>
      )}

      {/* ── FULL INDEX LIST ──────────────────────────────────────────────── */}
      {activeView === "index" && <MobileIndexList />}

      {/* ── DATA VIZ ─────────────────────────────────────────────────────── */}
      {activeView === "data" && (
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: "relative" }}>
          <DataView />
        </div>
      )}

      {/* BookOverlay — position:fixed so it breaks out of the flex stack.
          zIndex 9999 ensures it's always on top of the canvas.           */}
      <BookOverlay />
    </div>
  );
}
