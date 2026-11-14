import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, X } from 'lucide-react';
import { PRODUCTS } from '../content/products';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PaletteItem {
  id: string;
  title: string;
  category: 'Products' | 'Pages';
  path: string;
  badge?: string;
  description?: string;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const baseItems: PaletteItem[] = [
    { id: 'home', title: 'Home', category: 'Pages', path: '/', description: 'Overview and platform vision' },
    { id: 'products', title: 'All Products', category: 'Pages', path: '/products', description: 'Catalog of all industrial editions' },
    { id: 'platform', title: 'Platform & AI Operator', category: 'Pages', path: '/platform', description: 'Core architecture and security' },
    { id: 'pricing', title: 'Pricing & Plans', category: 'Pages', path: '/pricing', description: 'Flat per-plant subscription' },
    { id: 'about', title: 'About Plinth', category: 'Pages', path: '/about', description: 'Brand story and foundation' },
    { id: 'demo', title: 'Book a Demo', category: 'Pages', path: '/demo', description: 'Schedule an interactive walkthrough' },
    ...PRODUCTS.map((p): PaletteItem => ({
      id: `prod-${p.slug}`,
      title: p.name,
      category: 'Products',
      path: `/products/${p.slug}`,
      badge: p.status === 'available' ? 'Available' : 'Coming soon',
      description: p.tagline,
    })),
  ];

  const filteredItems = baseItems.filter((item) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const selectItem = (item: PaletteItem) => {
    onClose();
    navigate(item.path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        selectItem(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command search palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-ink/40 backdrop-blur-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface border border-border rounded-xl shadow-modal overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center px-4 py-3 border-b border-border gap-2">
          <Search className="w-4 h-4 text-ink-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search editions (e.g. manufacturing, pricing)..."
            className="w-full bg-transparent text-sm text-ink placeholder:text-ink-placeholder outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Close palette"
            className="p-1 text-ink-muted hover:text-ink rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-border/40" tabIndex={-1}>
          {filteredItems.length === 0 ? (
            <div className="p-6 text-center text-sm text-ink-muted">
              No matching pages or editions found.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors ${
                    isSelected ? 'bg-hover' : 'bg-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-ink">{item.title}</span>
                      <span className="text-xs text-ink-muted uppercase tracking-wider ">
                        {item.category}
                      </span>
                      {item.badge && (
                        <span
                          className={`text-xs px-1.5 py-0.2 rounded-full font-medium ${
                            item.badge === 'Available'
                              ? 'bg-green-bg text-green-text'
                              : 'bg-grey-bg text-grey-text'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-ink-secondary line-clamp-1">{item.description}</p>
                    )}
                  </div>
                  <ArrowRight
                    className={`w-4 h-4 transition-transform ${
                      isSelected ? 'text-accent translate-x-1' : 'text-ink-muted'
                    }`}
                  />
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-border bg-muted/40 text-xs text-ink-muted flex items-center justify-between ">
          <span>Navigate: ↑↓ • Select: Enter</span>
          <span>Close: Esc</span>
        </div>
      </div>
    </div>
  );
};
