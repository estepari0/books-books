"use client";

import { useState } from "react";
import { useStore } from "@/store";
import { genreColor } from "@/lib/genreColor";
import clsx from "clsx";

type SortField = 'title' | 'author' | 'year' | 'genre' | 'origin';
type SortOrder = 'asc' | 'desc';

export function IndexView() {
  const { filteredBooks, setSelectedBookId } = useStore();
  const [sortField, setSortField] = useState<SortField>('year');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const rows = [...filteredBooks]
    .filter(book => {
      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase();
      return book.title.toLowerCase().includes(term) || book.author.toLowerCase().includes(term);
    })
    .sort((a, b) => {
      const aVal = String(a[sortField] ?? '');
      const bVal = String(b[sortField] ?? '');
      const cmp  = aVal.localeCompare(bVal, undefined, { numeric: true });
      return sortOrder === 'asc' ? cmp : -cmp;
    });

  const columns: { field: SortField; label: string; hidden?: string }[] = [
    { field: 'title',  label: 'Title' },
    { field: 'author', label: 'Author' },
    { field: 'genre',  label: 'Genre',  hidden: 'hidden md:table-cell' },
    { field: 'origin', label: 'Origin', hidden: 'hidden lg:table-cell' },
    { field: 'year',   label: 'Year',   hidden: 'hidden sm:table-cell' },
  ];

  return (
    <div className="absolute inset-0 bg-[var(--background)] pt-20 pb-8 px-6 md:px-12 overflow-y-auto z-10" style={{ scrollbarWidth: 'none' }}>
      <div className="max-w-5xl mx-auto">

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search titles or authors…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full md:w-80 px-4 py-2.5 bg-white/60 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/10 font-sans text-sm placeholder:text-zinc-400"
          />
        </div>

        {/* Table */}
        <div className="bg-white/80 border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60">
                {columns.map(col => (
                  <th
                    key={col.field}
                    onClick={() => handleSort(col.field)}
                    className={clsx(
                      "py-3 px-4 text-[11px] font-semibold tracking-wider uppercase text-zinc-400 cursor-pointer select-none transition-colors hover:text-zinc-700",
                      col.hidden
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortField === col.field && (
                        <span className="text-zinc-700 text-[10px]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? rows.map((book, i) => (
                <tr
                  key={book.id}
                  onClick={() => setSelectedBookId(book.id)}
                  className={clsx(
                    "border-b border-zinc-100 last:border-0 cursor-pointer group transition-colors hover:bg-white",
                    i % 2 === 0 ? "" : "bg-zinc-50/40"
                  )}
                >
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      {/* Cover thumbnail on hover */}
                      <div className="w-7 h-10 bg-zinc-100 rounded-[2px] overflow-hidden shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {book.coverUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={book.coverUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <span className="font-serif text-[14px] text-zinc-900 group-hover:text-[var(--accent)] transition-colors leading-snug">
                        {book.title}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-sans text-xs text-zinc-600">{book.author}</td>
                  <td className={clsx("py-3.5 px-4", columns[2].hidden)}>
                    {book.genre && (
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium text-zinc-700"
                        style={{ backgroundColor: genreColor(book.genre) + '66' }}
                      >
                        {book.genre}
                      </span>
                    )}
                  </td>
                  <td className={clsx("py-3.5 px-4 font-sans text-xs text-zinc-500", columns[3].hidden)}>{book.origin}</td>
                  <td className={clsx("py-3.5 px-4 font-sans text-xs text-zinc-400 tabular-nums", columns[4].hidden)}>{book.year || '—'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-400 font-sans text-sm">
                    No books match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
