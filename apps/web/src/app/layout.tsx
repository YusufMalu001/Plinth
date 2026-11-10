import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Synergy International',
    template: '%s | Synergy International',
  },
  applicationName: 'Synergy International',
  description: 'Synergy International enterprise resource planning platform',
  icons: {
    // Use the standalone S mark from the sidebar logo for clear small-size rendering.
    icon: '/synergy-favicon.png',
    shortcut: '/synergy-favicon.png',
    apple: '/synergy-favicon.png',
  },
};

import { Providers } from '../components/Providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-gray-900 bg-gray-50">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
