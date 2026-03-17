"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store";
import clsx from "clsx";
import { genreColor } from "@/lib/genreColor";

export function IslandPanel() {
  const { filteredBooks, books, hoveredBookId, setHoveredBookId, setSelectedBookId } = useStore();
  const listRef = useRef<HTMLUListElement>(null);

  // Auto-scroll to hovered item when triggered from ShelfView
  useEffect(() => {
    if (hoveredBookId && listRef.current) {
      const el = listRef.current.querySelector(`[data-id="${hoveredBookId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [hoveredBookId]);

  return (
    <div className="fixed right-6 top-24 bottom-12 w-[300px] rounded-2xl glass-panel shadow-2xl overflow-hidden flex flex-col z-40 hidden md:flex">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200/50 flex justify-between items-center bg-white/40 shrink-0">
        <h2 className="font-sans text-xs font-semibold tracking-wider uppercase text-zinc-500">Index</h2>
        <span className="font-sans text-xs text-zinc-400">
          {filteredBooks.length}
          {filteredBooks.length !== books.length && (
            <span className="text-zinc-300"> / {books.length}</span>
          )}
        </span>
      </div>

      {/* List */}
      <ul ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-0.5" style={{ scrollbarWidth: 'none' }}>
        {filteredBooks.map((book) => {
          const isHovered = hoveredBookId === book.id;
          const color     = genreColor(book.genre);

          return (
            <li
              key={book.id}
              data-id={book.id}
              onMouseEnter={() => setHoveredBookId(book.id)}
              onMouseLeave={() => setHoveredBookId(null)}
              onClick={() => setSelectedBookId(book.id)}
              className={clsx(
                "px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 group flex items-center gap-3",
                isHovered ? "bg-white/70 shadow-sm translate-x-0.5" : "hover:bg-white/40"
              )}
            >
              {/* Genre color dot */}
              <span
                className="w-2 h-2 rounded-full shrink-0 opacity-70"
                style={{ backgroundColor: color }}
              />

              <div className="flex-1 min-w-0">
                <p className={clsx(
                  "font-serif text-[13px] leading-snug truncate transition-colors",
                  isHovered ? "text-[var(--accent)]" : "text-zinc-900 group-hover:text-[var(--accent)]"
                )}>
                  {book.title}
                </p>
                <p className="font-sans text-[11px] text-zinc-400 truncate mt-0.5">
                  {book.author}
                  {book.year ? <span className="ml-1.5 text-zinc-300">·&nbsp;{book.year}</span> : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
