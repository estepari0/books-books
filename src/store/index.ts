import { create } from 'zustand';
import type { Book } from '@/types';

export type ViewMode = 'shelf' | 'index' | 'data';

export interface FilterState {
  year:   number | 'All';
  genre:  string[];
  origin: string[];
  gender: string[];
  format: string[];
}

const DEFAULT_FILTERS: FilterState = {
  year:   'All',
  genre:  [],
  origin: [],
  gender: [],
  format: [],
};

function applyFilters(books: Book[], filters: FilterState): Book[] {
  return books.filter(book => {
    if (filters.year !== 'All' && book.year !== filters.year) return false;
    if (filters.genre.length  > 0 && !filters.genre.includes(book.genre))   return false;
    if (filters.origin.length > 0 && !filters.origin.includes(book.origin)) return false;
    if (filters.gender.length > 0 && !filters.gender.includes(book.gender)) return false;
    if (filters.format.length > 0 && !filters.format.includes(book.format)) return false;
    return true;
  });
}

interface StoreState {
  // Data
  books:         Book[];
  filteredBooks: Book[];
  isLoading:     boolean;
  error:         string | null;
  initialize:    () => Promise<void>;

  // View
  activeView:    ViewMode;
  setActiveView: (view: ViewMode) => void;

  // Selection / hover
  hoveredBookId:    string | null;
  setHoveredBookId: (id: string | null) => void;
  selectedBookId:   string | null;
  setSelectedBookId:(id: string | null) => void;

  // Filters
  filters:    FilterState;
  setFilter:  <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  clearFilters: () => void;

  // Scroll position — published by ShelfView RAF
  shelfScrollIndex:    number;
  setShelfScrollIndex: (n: number) => void;

  // Derived filter options (unique values from real data)
  availableYears:   number[];
  availableOrigins: string[];
  availableGenders: string[];
  availableFormats: string[];
}

export const useStore = create<StoreState>((set, get) => ({
  books:         [],
  filteredBooks: [],
  isLoading:     false,
  error:         null,

  initialize: async () => {
    // Only fetch once
    if (get().books.length > 0) return;

    set({ isLoading: true, error: null });

    try {
      const res = await fetch('/api/books');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const books: Book[] = await res.json();

      // Derive unique filter values from real data
      const availableYears   = [...new Set(books.map(b => b.year))].filter(Boolean).sort((a, b) => b - a);
      const availableOrigins = [...new Set(books.map(b => b.origin))].filter(Boolean).sort();
      const availableGenders = [...new Set(books.map(b => b.gender))].filter(Boolean).sort();
      const availableFormats = [...new Set(books.map(b => b.format))].filter(Boolean).sort();

      set({
        books,
        filteredBooks: books,
        availableYears,
        availableOrigins,
        availableGenders,
        availableFormats,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load books';
      console.error('[store] initialize error:', message);
      set({ isLoading: false, error: message });
    }
  },

  activeView: 'shelf',
  setActiveView: (view) => set({ activeView: view }),

  hoveredBookId: null,
  setHoveredBookId: (id) => set({ hoveredBookId: id }),
  selectedBookId: null,
  setSelectedBookId: (id) => set({ selectedBookId: id }),

  filters: DEFAULT_FILTERS,

  setFilter: (key, value) => set((state) => {
    const newFilters = { ...state.filters, [key]: value };
    return {
      filters:       newFilters,
      filteredBooks: applyFilters(state.books, newFilters),
    };
  }),

  clearFilters: () => set((state) => ({
    filters:       DEFAULT_FILTERS,
    filteredBooks: state.books,
  })),

  shelfScrollIndex: 0,
  setShelfScrollIndex: (n) => set({ shelfScrollIndex: n }),

  availableYears:   [],
  availableOrigins: [],
  availableGenders: [],
  availableFormats: [],
}));
