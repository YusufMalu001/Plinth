import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { CSS_TOKENS } from '@plinth/tokens';

import { Providers } from '../components/Providers';

/**
 * Inter — spec Phase 2 (font) and Addendum #4. `variable` registers the font
 * stack as --font-inter on <html>; CSS_TOKENS maps --font-sans onto it with a
 * system-ui fallback.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

import { PRODUCT_NAME } from '../config/brand';

export const metadata: Metadata = {
  title: {
    default: PRODUCT_NAME,
    template: `%s | ${PRODUCT_NAME}`,
  },
  applicationName: PRODUCT_NAME,
  description: 'Plinth enterprise resource planning platform',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <head>
      {/*
        Single source of truth: all design tokens come from @plinth/tokens.
        Injected once here; globals.css and Tailwind never repeat values.
        LIGHT-ONLY ships by default (Addendum #3).
      */}
        <style dangerouslySetInnerHTML={{ __html: CSS_TOKENS }} />
      </head>
      <body className="font-sans antialiased text-ink bg-page">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
