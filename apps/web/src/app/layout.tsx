import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import { CSS_TOKENS } from '@plinth/tokens';

import { Providers } from '../components/Providers';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
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
    <html lang="en" className={`${plusJakartaSans.variable} ${jetbrainsMono.variable}`}>
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
