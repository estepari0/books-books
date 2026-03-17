export interface Book {
  id: string;
  title: string;
  author: string;
  origin: string;
  genre: string;
  gender: string;
  published: string;
  year: number;
  dateRead: number;
  format: string;
  brief?: string;
  quotes?: string;
  coverUrl?: string;
}
