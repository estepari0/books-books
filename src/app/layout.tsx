import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, EB_Garamond } from 'next/font/google';
import './globals.css';

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500'],
});

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['400', '500'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Books Books',
  description: 'A personal reading library visualizer',
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // enables env(safe-area-inset-*) for iPhone notch/home bar
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${ibmPlexMono.variable} ${ebGaramond.variable}`}>{children}</body>
    </html>
  );
}
