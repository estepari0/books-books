"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store";
import gsap from "gsap";

const SERIF: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  lineHeight: 1.15,
};

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 10,
  letterSpacing: "0.06em",
  lineHeight: 1.1,
};

const ROW_TITLE = 36;
const ROW_META  = 26;
const ROW_TABS  = 24;
const ROW_BODY  = 164;  // desktop only
const ROW_ESC   = 24;

type Tab = "synopsis" | "quotes";

export function BookOverlay({
  mobileMode = false,
  onScrollChange,
}: {
  mobileMode?: boolean;
  onScrollChange?: (direction: "up" | "down") => void;
}) {
  const selectedBookId    = useStore(s => s.selectedBookId);
  const setSelectedBookId = useStore(s => s.setSelectedBookId);
  const books             = useStore(s => s.books);
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef  = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const [tab, setTab] = useState<Tab>("synopsis");

  const book = useMemo(
    () => books.find(b => b.id === selectedBookId) ?? null,
    [books, selectedBookId],
  );

  useEffect(() => {
    if (selectedBookId) setTab("synopsis");
  }, [selectedBookId]);

  // Entrance animation
  useEffect(() => {
    if (!selectedBookId) return;
    const raf = requestAnimationFrame(() => {
      if (!overlayRef.current || !contentRef.current) return;
      gsap.fromTo(overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.35, ease: "power2.out", delay: 0.1 }
      );
      gsap.fromTo(contentRef.current,
        { y: 14, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.38, ease: "power2.out", delay: 0.22,
          // Clear transform after animation so iOS Safari scroll isn't broken
          // by a residual translateY(0px) on an ancestor of scrollable content
          onComplete: () => {
            if (contentRef.current) {
              contentRef.current.style.transform = "";
            }
          },
        }
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedBookId]);

  const handleClose = () => {
    if (!overlayRef.current) { setSelectedBookId(null); return; }
    gsap.to(overlayRef.current, {
      opacity: 0, duration: 0.22, ease: "power2.in",
      onComplete: () => setSelectedBookId(null),
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBookId]);

  // Scroll tracking for mobile header fade
  const handleScrollWrapperScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!onScrollChange) return;
    const y = e.currentTarget.scrollTop;
    const dir: "up" | "down" = y > lastScrollY.current ? "down" : "up";
    lastScrollY.current = y;
    onScrollChange(dir);
  };

  if (!selectedBookId || !book) return null;

  const pubYear  = book.published ? String(book.published).slice(0, 4) : "—";
  const bodyText = tab === "synopsis" ? (book.brief ?? "") : (book.quotes ?? "");

  // ── Shared panel content (title + meta + tabs + body + ESC) ─────────────────
  const panelContent = (
    <div style={{ width: "min(520px, 88%)" }}>

      {/* title */}
      <div style={{
        height: ROW_TITLE, display: "flex", alignItems: "flex-end",
        paddingBottom: 7, borderBottom: "1px solid #141412", overflow: "hidden",
      }}>
        <span style={{
          ...SERIF, fontSize: 26, color: "#141412",
          display: "block", width: "100%",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {book.title}
        </span>
      </div>

      {/* meta */}
      <div style={{
        height: ROW_META, display: "grid",
        gridTemplateColumns: "1fr 12px auto 12px auto 12px auto",
        alignItems: "center", borderBottom: "0.5px solid #14141220",
      }}>
        <span style={{ ...SERIF, fontSize: 13, color: "#141412", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.author}</span>
        <span style={{ ...SERIF, fontSize: 14, color: "#14141244", lineHeight: 0.9, textAlign: "center" }}>|</span>
        <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap" }}>{pubYear}</span>
        <span style={{ ...SERIF, fontSize: 14, color: "#14141244", lineHeight: 0.9, textAlign: "center" }}>|</span>
        <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap" }}>{book.genre}</span>
        <span style={{ ...SERIF, fontSize: 14, color: "#14141244", lineHeight: 0.9, textAlign: "center" }}>|</span>
        <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{book.origin}</span>
      </div>

      {/* tabs */}
      <div style={{ height: ROW_TABS, display: "flex", alignItems: "flex-end", gap: 16 }}>
        {(["synopsis", "quotes"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...MONO, background: "none", border: "none",
              borderBottom: tab === t ? "1px solid #141412" : "1px solid transparent",
              padding: "0 0 5px", cursor: "pointer",
              color: "#141412", opacity: tab === t ? 1 : 0.35,
              transition: "opacity 0.15s, border-color 0.15s",
              textTransform: "uppercase", letterSpacing: "0.08em",
              WebkitTapHighlightColor: "transparent",
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
            onMouseLeave={e => (e.currentTarget.style.opacity = tab === t ? "1" : "0.35")}
          >
            {t}
          </button>
        ))}
      </div>

      {/* body */}
      <div
        // Desktop: fixed height with internal scroll
        // Mobile: natural height (no overflow) — the outer scroll wrapper handles it
        onScroll={!mobileMode ? undefined : undefined}
        style={{
          ...(mobileMode
            ? { minHeight: 120 }                      // just a min so short synopses look ok
            : { height: ROW_BODY, overflowY: "auto" as const } // desktop: fixed scroll box
          ),
          borderTop: "0.5px solid #14141220",
          paddingTop: 8, paddingRight: 4, paddingBottom: mobileMode ? 40 : 4,
          boxSizing: "border-box" as const,
        }}
      >
        {bodyText ? (
          <p style={{
            ...SERIF, fontSize: 15, color: "#141412",
            lineHeight: 1.65, opacity: 0.72,
            margin: 0, whiteSpace: "pre-wrap",
          }}>
            {bodyText}
          </p>
        ) : (
          <span style={{ display: "block", height: mobileMode ? 60 : "100%" }} />
        )}
      </div>

      {/* ESC */}
      <div style={{
        height: ROW_ESC, borderTop: "0.5px solid #14141214",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
      }}>
        <button
          onClick={handleClose}
          style={{
            ...MONO, color: "#141412", opacity: 0.3,
            background: "none", border: "none", cursor: "pointer",
            letterSpacing: "0.1em", padding: 0, transition: "opacity 0.15s",
            textTransform: "uppercase",
            WebkitTapHighlightColor: "transparent",
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={e => (e.currentTarget.style.opacity = "0.3")}
        >
          ESC
        </button>
      </div>

    </div>
  );

  // ── DESKTOP: same as before — fixed panel at the bottom ─────────────────────
  if (!mobileMode) {
    return (
      <div
        ref={overlayRef}
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "transparent",
          opacity: 0,
        }}
      >
        {/* dismiss backdrop */}
        <div style={{ position: "absolute", inset: 0 }} onClick={handleClose} />

        {/* panel pinned to bottom */}
        <div
          ref={contentRef}
          style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            paddingBottom: 21,
            display: "flex",
            justifyContent: "center",
            pointerEvents: "auto",
          }}
          onClick={e => e.stopPropagation()}
        >
          {panelContent}
        </div>
      </div>
    );
  }

  // ── MOBILE: full-screen scroll wrapper with spacer + panel ──────────────────
  // Structure:
  //   overlay (fixed, inset:0)              ← GSAP fades this in
  //     dismiss backdrop                    ← tap to close
  //     scrollWrapper (absolute, inset:0, overflowY:auto)  ← user scrolls this
  //       spacer (50svh transparent)        ← 3D book visible behind
  //       contentRef panel (solid bg)       ← GSAP slides this in, then clears transform
  //         title / meta / tabs / body (natural height) / ESC
  //
  // The scroll is on scrollWrapper (no GSAP transforms).
  // contentRef has a brief y:14→0 entrance, then transform is cleared.
  const mobileOverlay = (
    <div
      ref={overlayRef}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "transparent",
        opacity: 0,
      }}
    >
      {/* dismiss backdrop — only covers the spacer area so tapping above panel closes */}
      <div style={{ position: "absolute", inset: 0 }} onClick={handleClose} />

      {/* scrollable wrapper — NO transforms, NO position tricks */}
      <div
        ref={scrollRef}
        onScroll={handleScrollWrapperScroll}
        style={{
          position: "absolute",
          inset: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
          scrollbarWidth: "none" as React.CSSProperties["scrollbarWidth"],
          pointerEvents: "auto",
        }}
      >
        {/* Transparent spacer — nearly full-screen so the 3D book is fully
            visible when the modal first opens. Only the panel title peeks at
            the bottom. Tap here to dismiss. Scroll down to read content. */}
        <div
          style={{ height: "calc(100svh - 80px)", flexShrink: 0 }}
          onClick={handleClose}
        />

        {/* Panel — solid background, full natural height.
            Sits below the spacer in the scroll flow. */}
        <div
          ref={contentRef}
          style={{
            background: "#E6E6E6",
            display: "flex",
            justifyContent: "center",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
            // min-height so short synopses still fill the screen after scrolling
            minHeight: "100svh",
          }}
          onClick={e => e.stopPropagation()}
        >
          {panelContent}
        </div>
      </div>
    </div>
  );

  return createPortal(mobileOverlay, document.body);
}
