/**
 * Maps a genre string to its hex color from the design system.
 * Used consistently across FilterBar, IslandPanel, DetailPanel, and DataView.
 */
const GENRE_COLORS: Record<string, string> = {
  'Fiction':                              '#e4afa4',
  'Science Fiction':                      '#b5c7d3',
  'Historical Fiction':                   '#d4c2a5',
  'Poetry':                               '#e6cce3',
  'Essay':                                '#c5d4b5',
  'Memoir':                               '#dbbfbe',
  'Philosophy':                           '#d9d0e2',
  'History':                              '#ceb7a3',
  'Indigenous Knowledge & Spirituality':  '#c7d1ab',
  'Anthropology':                         '#e0cca9',
  'Science & Technology':                 '#aecfcc',
  'Design':                               '#d9d9d9',
  'Journalism':                           '#e8cbaa',
};

const FALLBACK = '#d4d4d4';

export function genreColor(genre: string): string {
  return GENRE_COLORS[genre] ?? FALLBACK;
}

export { GENRE_COLORS };
