import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X, Command } from 'lucide-react';
import { Logo } from './Logo';
import { StatusPill } from './StatusPill';
import { DynamicIcon } from './DynamicIcon';
import { CommandPalette } from './CommandPalette';
import { PRODUCTS } from '../content/products';

export const Navigation: React.FC = () => {
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const megaMenuCloseTimeout = useRef<NodeJS.Timeout | null>(null);
  const megaMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const appSignInUrl = import.meta.env.VITE_APP_URL || 'https://app.plintherp.com/login';

  // Close menus on route change
  useEffect(() => {
    setIsMegaMenuOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll on mobile drawer open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Keyboard shortcut Cmd/Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMouseEnterProducts = () => {
    if (megaMenuCloseTimeout.current) {
      clearTimeout(megaMenuCloseTimeout.current);
      megaMenuCloseTimeout.current = null;
    }
    setIsMegaMenuOpen(true);
  };

  const handleMouseLeaveProducts = () => {
    megaMenuCloseTimeout.current = setTimeout(() => {
      setIsMegaMenuOpen(false);
    }, 150);
  };

  const handleProductsKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setIsMegaMenuOpen(true);
      // focus first element in mega menu
      setTimeout(() => {
        const firstLink = megaMenuRef.current?.querySelector('a');
        firstLink?.focus();
      }, 50);
    } else if (e.key === 'Escape') {
      setIsMegaMenuOpen(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 h-16 w-full bg-surface border-b border-border">
        <div className="max-w-content mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo />

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1" aria-label="Main Navigation">
              {/* Products Mega Menu Button */}
              <div
                className="relative"
                onMouseEnter={handleMouseEnterProducts}
                onMouseLeave={handleMouseLeaveProducts}
              >
                <button
                  type="button"
                  aria-expanded={isMegaMenuOpen}
                  aria-controls="products-mega-menu"
                  onKeyDown={handleProductsKeyDown}
                  onClick={() => setIsMegaMenuOpen((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    location.pathname.startsWith('/products')
                      ? 'text-ink font-semibold'
                      : 'text-ink-secondary hover:text-ink hover:bg-hover'
                  }`}
                >
                  <span>Products</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-150 ${
                      isMegaMenuOpen ? 'rotate-180 text-ink' : 'text-ink-muted'
                    }`}
                  />
                </button>

                {/* Mega Menu Dropdown */}
                {isMegaMenuOpen && (
                  <div
                    id="products-mega-menu"
                    ref={megaMenuRef}
                    role="region"
                    aria-label="Products Editions Menu"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setIsMegaMenuOpen(false);
                      }
                    }}
                    className="absolute top-full left-0 mt-1 w-[680px] bg-surface border border-border rounded-xl shadow-popover p-5 animate-in fade-in slide-in-from-top-1 duration-150 z-50"
                  >
                    <div className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted mb-3">
                      Industrial Product Editions
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {PRODUCTS.map((product) => (
                        <Link
                          key={product.slug}
                          to={`/products/${product.slug}`}
                          className={`flex items-start gap-3 p-3 rounded-lg border border-transparent hover:border-border hover:bg-hover transition-colors group ${
                            location.pathname === `/products/${product.slug}`
                              ? 'bg-muted border-border'
                              : ''
                          }`}
                        >
                          <div className="p-2 rounded-md bg-muted text-ink group-hover:bg-surface border border-border/60 shrink-0">
                            <DynamicIcon name={product.modules[0]?.iconName || 'Box'} size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-semibold text-ink group-hover:text-accent transition-colors">
                                {product.name}
                              </span>
                              <StatusPill status={product.status} />
                            </div>
                            <p className="text-xs text-ink-secondary mt-1 line-clamp-1">
                              {product.tagline}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-ink-secondary">
                      <span>Standardized on the unified Plinth operational architecture</span>
                      <Link
                        to="/products"
                        className="font-semibold text-ink-link hover:underline inline-flex items-center gap-1"
                      >
                        View all products overview &rarr;
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <NavLink
                to="/platform"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'text-ink font-semibold' : 'text-ink-secondary hover:text-ink hover:bg-hover'
                  }`
                }
              >
                Platform
              </NavLink>

              <NavLink
                to="/pricing"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'text-ink font-semibold' : 'text-ink-secondary hover:text-ink hover:bg-hover'
                  }`
                }
              >
                Pricing
              </NavLink>

              <NavLink
                to="/about"
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'text-ink font-semibold' : 'text-ink-secondary hover:text-ink hover:bg-hover'
                  }`
                }
              >
                About
              </NavLink>
            </nav>
          </div>

          {/* Right Action buttons */}
          <div className="flex items-center gap-3">
            {/* Command Palette Trigger */}
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              aria-label="Open Command search palette (Cmd+K)"
              className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 text-xs text-ink-muted border border-border rounded-md hover:bg-hover hover:text-ink transition-colors font-mono"
            >
              <Command className="w-3.5 h-3.5" />
              <span>Search</span>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-muted border border-border-strong rounded font-mono">
                ⌘K
              </kbd>
            </button>

            {/* Sign in to ERP */}
            <a
              href={appSignInUrl}
              className="hidden sm:inline-flex text-sm font-medium text-ink-secondary hover:text-ink px-2 py-1.5 transition-colors"
            >
              Sign in
            </a>

            {/* Book a Demo Button */}
            <Link
              to="/demo"
              className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-inverse text-ink-inverse text-sm font-semibold hover:bg-ink-secondary/90 transition-colors"
            >
              Book a demo
            </Link>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label={isMobileMenuOpen ? 'Close Menu' : 'Open Navigation Menu'}
              className="lg:hidden p-2 text-ink rounded-md hover:bg-hover focus-visible:ring-2 focus-visible:ring-accent outline-none"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Navigation (<1024px) */}
      {isMobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
          className="lg:hidden fixed inset-0 top-16 z-50 bg-surface flex flex-col overflow-y-auto p-6"
        >
          <div className="flex flex-col gap-4">
            <div className="border-b border-border pb-4">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted mb-2 block">
                Products
              </span>
              <div className="flex flex-col gap-2">
                {PRODUCTS.map((product) => (
                  <Link
                    key={product.slug}
                    to={`/products/${product.slug}`}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-hover"
                  >
                    <span className="text-sm font-medium text-ink">{product.name}</span>
                    <StatusPill status={product.status} />
                  </Link>
                ))}
                <Link
                  to="/products"
                  className="text-xs font-semibold text-ink-link hover:underline mt-1 p-2"
                >
                  All products overview &rarr;
                </Link>
              </div>
            </div>

            <Link
              to="/platform"
              className="text-base font-semibold text-ink py-2 border-b border-border"
            >
              Platform
            </Link>
            <Link
              to="/pricing"
              className="text-base font-semibold text-ink py-2 border-b border-border"
            >
              Pricing
            </Link>
            <Link
              to="/about"
              className="text-base font-semibold text-ink py-2 border-b border-border"
            >
              About
            </Link>

            <div className="pt-4 flex flex-col gap-3">
              <a
                href={appSignInUrl}
                className="w-full text-center py-2.5 rounded-md border border-border text-sm font-semibold text-ink hover:bg-hover"
              >
                Sign in to Plinth ERP
              </a>
              <Link
                to="/demo"
                className="w-full text-center py-2.5 rounded-md bg-inverse text-ink-inverse text-sm font-semibold hover:bg-ink-secondary/90"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette Modal */}
      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
    </>
  );
};
