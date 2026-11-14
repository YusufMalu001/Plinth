import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MorphicNavbar from './kokonutui/morphic-navbar';
import { PlinthMark } from './Logo';
import { CommandPalette } from './CommandPalette';

export const Navigation: React.FC = () => {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const appSignInUrl = import.meta.env.VITE_APP_URL || '/login';

  // Keyboard shortcut Cmd/Ctrl+K and hash change listener for #search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };

    const handleHashChange = () => {
      if (window.location.hash === '#search') {
        setIsPaletteOpen(true);
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const navItems = {
    '/': { name: 'Home' },
    '/products': { name: 'Products' },
    '/platform': { name: 'Platform' },
    '/pricing': { name: 'Pricing' },
    '/about': { name: 'About' },
    '#search': { name: 'Search ⌘K' },
    [appSignInUrl]: { name: 'Sign in' },
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full pt-3 px-4 sm:px-6 lg:px-8 pointer-events-none flex items-center justify-between max-w-content mx-auto">
        {/* Brand Logo Lockup */}
        <div className="pointer-events-auto shrink-0 flex items-center">
          <Link
            to="/"
            aria-label="Plinth Home"
            className="inline-flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm py-1"
          >
            <PlinthMark className="w-5 h-6" tone="ink" />
            <span className="text-xl font-bold tracking-tight text-ink hidden sm:inline">
              Plinth
            </span>
          </Link>
        </div>

        {/* Morphic Navbar from Kokonut UI */}
        <div className="pointer-events-auto flex justify-center flex-1">
          <MorphicNavbar
            items={navItems}
            compact={true}
            className="py-0"
          />
        </div>

        {/* Right CTA button */}
        <div className="pointer-events-auto shrink-0 hidden md:flex items-center gap-2">
          <Link
            to="/demo"
            className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-inverse text-surface text-xs font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            Book a demo
          </Link>
        </div>
      </header>

      {/* Global Command Palette */}
      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
    </>
  );
};
