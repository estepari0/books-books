"use client";

import { useStore } from "@/store";
import { X } from "lucide-react";
import { genreColor } from "@/lib/genreColor";

export function DetailPanel() {
  const { selectedBookId, setSelectedBookId, books } = useStore();

  const book = books.find(b => b.id === selectedBookId) ?? null;

  // Split quotes string into individual quote blocks
  const quoteBlocks = book?.quotes
    ? book.quotes.split(/\n{2,}/).map(q => q.trim()).filter(Boolean)
    : [];

  return (
    <>
      {/* Dim backdrop — shelf stays visible behind it */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 transition-opacity duration-300 ${
          selectedBookId ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSelectedBookId(null)}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 w-full md:w-[460px] bg-[var(--background)]/90 backdrop-blur-3xl border-l border-zinc-200/60 shadow-2xl z-50 flex flex-col transform transition-transform duration-500 ease-out ${
          selectedBookId ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {book ? (
          <>
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-zinc-100/60 shrink-0">
              <span className="font-sans text-[10px] tracking-widest uppercase text-zinc-400">Detail</span>
              <button
                onClick={() => setSelectedBookId(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 text-zinc-400 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto pb-16" style={{ scrollbarWidth: 'none' }}>
              {/* Cover */}
              <div className="px-8 pt-8 flex justify-center">
                <div className="w-[180px] h-[270px] bg-zinc-200 rounded-sm shadow-2xl overflow-hidden shrink-0">
                  {book.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-4 text-center bg-zinc-100">
                      <span className="font-serif text-xs text-zinc-400">{book.title}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Core metadata */}
              <div className="px-8 pt-6 text-center">
                <h1 className="font-serif text-2xl font-medium text-zinc-900 leading-tight mb-1">
                  {book.title}
                </h1>
                <p className="font-sans text-sm text-zinc-500 mb-5">{book.author}</p>

                {/* Genre + origin chips */}
                <div className="flex flex-wrap justify-center gap-1.5 mb-6">
                  {book.genre && (
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium text-zinc-700"
                      style={{ backgroundColor: genreColor(book.genre) + '55' }}
                    >
                      {book.genre}
                    </span>
                  )}
                  {book.origin && (
                    <span className="px-2.5 py-1 rounded-full border border-zinc-200 text-[11px] text-zinc-500">
                      {book.origin}
                    </span>
                  )}
                  {book.format && (
                    <span className="px-2.5 py-1 rounded-full border border-zinc-200 text-[11px] text-zinc-500">
                      {book.format}
                    </span>
                  )}
                </div>

                {/* Secondary metadata row */}
                <div className="flex justify-center gap-6 text-center mb-8">
                  {book.published && (
                    <div>
                      <p className="font-sans text-[10px] tracking-wider uppercase text-zinc-400 mb-0.5">Published</p>
                      <p className="font-sans text-sm text-zinc-700">{book.published}</p>
                    </div>
                  )}
                  {book.year > 0 && (
                    <div>
                      <p className="font-sans text-[10px] tracking-wider uppercase text-zinc-400 mb-0.5">Read</p>
                      <p className="font-sans text-sm text-zinc-700">{book.year}</p>
                    </div>
                  )}
                  {book.gender && (
                    <div>
                      <p className="font-sans text-[10px] tracking-wider uppercase text-zinc-400 mb-0.5">Author</p>
                      <p className="font-sans text-sm text-zinc-700">{book.gender}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Brief */}
              {book.brief && (
                <div className="px-8 mb-8 border-t border-zinc-100 pt-6">
                  <h3 className="font-sans text-[10px] tracking-widest uppercase text-zinc-400 mb-3">Brief</h3>
                  <p className="font-serif text-[15px] text-zinc-700 leading-relaxed">{book.brief}</p>
                </div>
              )}

              {/* Quotes */}
              {quoteBlocks.length > 0 && (
                <div className="px-8 mb-8 border-t border-zinc-100 pt-6">
                  <h3 className="font-sans text-[10px] tracking-widest uppercase text-zinc-400 mb-4">Quotes</h3>
                  <div className="space-y-4">
                    {quoteBlocks.map((quote, i) => (
                      <blockquote
                        key={i}
                        className="border-l-2 pl-4 py-0.5"
                        style={{ borderColor: genreColor(book.genre) }}
                      >
                        <p className="font-serif italic text-[14px] text-zinc-600 leading-relaxed">
                          {quote}
                        </p>
                      </blockquote>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-300 font-sans text-sm">
            Select a book
          </div>
        )}
      </div>
    </>
  );
}
