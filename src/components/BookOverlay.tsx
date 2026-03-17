"use client";

import { useEffect, useRef, useState } from "react";
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

// All rows are fixed height — no layout shift between books or empty states
const ROW_TITLE  = 36;   // title + underline
const ROW_META   = 26;   // author | year | genre | country
const ROW_TABS   = 24;   // tab strip
const ROW_BODY   = 164;  // synopsis / quotes — fixed, internal scroll (~8–9 lines at 14px/1.65)
const ROW_ESC    = 24;   // close row

type Tab = "synopsis" | "quotes";

export function BookOverlay() {
  const { selectedBookId, setSelectedBookId, books } = useStore();
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("synopsis");

  const book = books.find(b => b.id === selectedBookId) ?? null;

  // Reset to synopsis whenever a new book opens
  useEffect(() => {
    if (selectedBookId) setTab("synopsis");
  }, [selectedBookId]);

  useEffect(() => {
    if (!overlayRef.current || !contentRef.current) return;
    if (selectedBookId) {
      gsap.fromTo(overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.35, ease: "power2.out", delay: 0.2 }
      );
      gsap.fromTo(contentRef.current,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.38, ease: "power2.out", delay: 0.36 }
      );
    }
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

  if (!selectedBookId) return null;

  const pubYear = book?.published ? String(book.published).slice(0, 4) : "—";
  const bodyText = tab === "synopsis" ? (book?.brief ?? "") : (book?.quotes ?? "");

  return (
    <div
      ref={overlayRef}
      style={{
        position: "fixed", inset: 0, zIndex: 40,
        background: "transparent",
        opacity: 0,
      }}
    >
      {/* click anywhere to dismiss */}
      <div style={{ position: "absolute", inset: 0 }} onClick={handleClose} />

      {/* ── Metadata panel — fixed total height, centered over the book ── */}
      <div
        ref={contentRef}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingBottom: 21,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        {book && (
          <div style={{ width: "min(520px, 88%)" }}>

            {/* ── Title — underline divider ── */}
            <div style={{
              height: ROW_TITLE,
              display: "flex",
              alignItems: "flex-end",
              paddingBottom: 7,
              borderBottom: "1px solid #141412",
              overflow: "hidden",
            }}>
              <span style={{
                ...SERIF, fontSize: 26, color: "#141412",
                display: "block", width: "100%",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {book.title}
              </span>
            </div>

            {/* ── Metadata: Author | Year | Genre | Country ── */}
            <div style={{
              height: ROW_META,
              display: "grid",
              gridTemplateColumns: "1fr 12px auto 12px auto 12px auto",
              alignItems: "center",
              borderBottom: "0.5px solid #14141220",
            }}>
              <span style={{ ...SERIF, fontSize: 13, color: "#141412", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {book.author}
              </span>
              <span style={{ ...SERIF, fontSize: 14, color: "#14141244", lineHeight: 0.9, textAlign: "center" }}>|</span>
              <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap" }}>{pubYear}</span>
              <span style={{ ...SERIF, fontSize: 14, color: "#14141244", lineHeight: 0.9, textAlign: "center" }}>|</span>
              <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap" }}>{book.genre}</span>
              <span style={{ ...SERIF, fontSize: 14, color: "#14141244", lineHeight: 0.9, textAlign: "center" }}>|</span>
              <span style={{ ...SERIF, fontSize: 13, color: "#838383", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{book.origin}</span>
            </div>

            {/* ── Tabs: SYNOPSIS / QUOTES — underline indicator ── */}
            <div style={{
              height: ROW_TABS,
              display: "flex",
              alignItems: "flex-end",
              gap: 16,
            }}>
              {(["synopsis", "quotes"] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    ...MONO,
                    background: "none",
                    border: "none",
                    borderBottom: tab === t ? "1px solid #141412" : "1px solid transparent",
                    padding: "0 0 5px",
                    cursor: "pointer",
                    color: "#141412",
                    opacity: tab === t ? 1 : 0.35,
                    transition: "opacity 0.15s, border-color 0.15s",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
                  onMouseLeave={e => (e.currentTarget.style.opacity = tab === t ? "1" : "0.35")}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ── Body: fixed height, internal scroll, no layout shift ── */}
            <div style={{
              height: ROW_BODY,
              borderTop: "0.5px solid #14141220",
              overflowY: "auto",
              paddingTop: 8,
              paddingRight: 4,
              paddingBottom: 4,
              boxSizing: "border-box",
            }}>
              {bodyText ? (
                <p style={{
                  ...SERIF,
                  fontSize: 15,
                  color: "#141412",
                  lineHeight: 1.65,
                  opacity: 0.72,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                }}>
                  {bodyText}
                </p>
              ) : (
                // empty state — same height, no text, no jump
                <span style={{ display: "block", height: "100%" }} />
              )}
            </div>

            {/* ── ESC ── */}
            <div style={{
              height: ROW_ESC,
              borderTop: "0.5px solid #14141214",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
            }}>
              <button
                onClick={handleClose}
                style={{
                  ...MONO, color: "#141412", opacity: 0.3,
                  background: "none", border: "none", cursor: "pointer",
                  letterSpacing: "0.1em", padding: 0, transition: "opacity 0.15s",
                  textTransform: "uppercase",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "0.3")}
              >
                ESC
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
