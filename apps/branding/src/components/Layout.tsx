import React, { useEffect, useRef } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { Navigation } from './Navigation';
import { Footer } from './Footer';

export const Layout: React.FC = () => {
  const { pathname } = useLocation();
  const mainHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // Scroll to top and restore heading focus on route change
  useEffect(() => {
    window.scrollTo(0, 0);

    // Give react time to render new route
    const timeout = setTimeout(() => {
      const h1 = document.querySelector('h1');
      if (h1) {
        h1.tabIndex = -1;
        h1.focus();
        h1.style.outline = 'none';
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-page text-ink selection:bg-accent-soft selection:text-accent">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 px-4 py-2 bg-inverse text-ink-inverse text-sm font-semibold rounded-md shadow-modal"
      >
        Skip to main content
      </a>

      <Navigation />

      <main
        id="main-content"
        ref={mainHeadingRef as unknown as React.RefObject<HTMLDivElement>}
        className="flex-1 flex flex-col"
      >
        <Outlet />
      </main>

      <Footer />
    </div>
  );
};
