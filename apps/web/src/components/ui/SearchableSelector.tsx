import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Search, ChevronDown, Check, X, Plus } from 'lucide-react';
import { VariantBadge } from './VariantBadge';
import { formatVariantName, getVariantLabel } from '../../features/products/variant-names';

export interface SearchableOption {
  id: string;
  name: string;
  code?: string;
  disabled?: boolean;
  sku?: string;
  symbol?: string;
  status?: string;
  isVariant?: boolean;
  parentOptionId?: string;
  parentItemName?: string;
}

interface SearchableSelectorProps<T extends SearchableOption> {
  value?: string;
  onChange: (value: string) => void;
  options: T[] | undefined;
  isLoading?: boolean;
  error?: Error | string | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  label?: string;
  allowCustom?: boolean;
  renderOption?: (option: T) => React.ReactNode;
  renderSelectedOption?: (option: T) => React.ReactNode;
  includeDraftOptions?: boolean;
  showOptionCode?: boolean;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  multiple?: boolean;
  selectedValues?: string[];
  onMultiChange?: (values: string[]) => void;
  clearable?: boolean;
  onClear?: () => void;
  onAddNew?: () => void;
  addNewText?: string;
}

interface DropdownPosition {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
}

function isElementVisible(el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    if (node.hasAttribute('hidden')) return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;
    if ((node as HTMLElement).inert) return false;
    const style = (node as HTMLElement).style;
    if (style) {
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
    }
    node = node.parentElement;
  }
  return true;
}

function findNextFocusable(current: HTMLElement | null, direction: 1 | -1 = 1): HTMLElement | null {
  if (!current || typeof document === 'undefined') return null;
  const container = current.closest('form') || current.closest('[data-focus-boundary]') || document.body;
  const allFocusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => {
    if (el.hasAttribute('data-keyboard-skip')) return false;
    return isElementVisible(el);
  });
  const index = allFocusable.indexOf(current);
  if (index === -1) return null;
  const next = allFocusable[index + direction];
  return next ?? (direction === 1 ? allFocusable[0] : allFocusable[allFocusable.length - 1]);
}

export function SearchableSelector<T extends SearchableOption>({
  value,
  onChange,
  options,
  isLoading,
  error,
  placeholder = 'Select an option...',
  disabled,
  className,
  size = 'md',
  label,
  allowCustom,
  renderOption,
  renderSelectedOption,
  includeDraftOptions = false,
  showOptionCode = true,
  searchTerm: controlledSearchTerm,
  onSearchTermChange,
  clearable = false,
  onClear,
  onAddNew,
  addNewText,
  multiple = false,
  selectedValues = [],
  onMultiChange,
}: SearchableSelectorProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const searchTerm = controlledSearchTerm ?? localSearchTerm;
  const setSearchTerm = onSearchTermChange ?? setLocalSearchTerm;
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<DropdownPosition | null>(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);


  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeItem = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      if (typeof activeItem?.scrollIntoView === 'function') {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);
  useEffect(() => {
    setMounted(true);
  }, []);

  const selectedOption = useMemo(() => {
    if (!value) return null;
    if (options && options.length > 0) {
      const found = options.find(
        (opt) =>
          opt.id === value ||
          (opt.code && opt.code.toLowerCase() === value.toLowerCase()) ||
          (opt.sku && opt.sku.toLowerCase() === value.toLowerCase()) ||
          opt.name.toLowerCase() === value.toLowerCase()
      );
      if (found) return found;
    }
    if (value) {
      return { id: value, name: value, code: value } as unknown as T;
    }
    return null;
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!options) return [];

    // Terminal variants must not reappear in item selectors just because they
    // carry a variant/parent marker.
    const activeOptions = options.filter(
      (opt) =>
        opt.status !== 'INACTIVE' &&
        opt.status !== 'SUPERSEDED' &&
        (
          !opt.status ||
          opt.status === 'ACTIVE' ||
          opt.status === 'APPROVED' ||
          (includeDraftOptions && (opt.status === 'DRAFT' || opt.status === 'PENDING_VALIDATION')) ||
          Boolean(opt.isVariant) ||
          Boolean(opt.parentOptionId)
        )
    );

    let candidateOptions = activeOptions;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchingOptions = activeOptions.filter((opt) => {
        const o = opt as any;
        return (
          opt.name.toLowerCase().includes(term) ||
          Boolean(opt.code && opt.code.toLowerCase().includes(term)) ||
          Boolean(opt.sku && opt.sku.toLowerCase().includes(term)) ||
          Boolean(opt.parentItemName && opt.parentItemName.toLowerCase().includes(term)) ||
          Boolean(o.parentCode && o.parentCode.toLowerCase().includes(term)) ||
          Boolean(o.parentSku && o.parentSku.toLowerCase().includes(term)) ||
          Boolean(o.category?.name && o.category.name.toLowerCase().includes(term)) ||
          Boolean(o.measurementValue && String(o.measurementValue).toLowerCase().includes(term)) ||
          Boolean(o.description && o.description.toLowerCase().includes(term))
        );
      });

      const matchingParentIds = new Set<string>();
      const visibleParentIds = new Set<string>();

      for (const option of matchingOptions) {
        if (option.parentOptionId) {
          visibleParentIds.add(option.parentOptionId);
        } else {
          matchingParentIds.add(option.id);
        }
      }

      candidateOptions = activeOptions.filter(
        (option) =>
          matchingOptions.includes(option) ||
          visibleParentIds.has(option.id) ||
          Boolean(option.parentOptionId && (matchingParentIds.has(option.parentOptionId) || visibleParentIds.has(option.parentOptionId)))
      );
    }

    // Preserve strict hierarchical ordering: Parent items first, immediately followed by their variants
    const optionMap = new Map<string, T>();
    for (const opt of candidateOptions) {
      optionMap.set(opt.id, opt);
    }

    const childrenByParent = new Map<string, T[]>();
    for (const opt of candidateOptions) {
      if (opt.parentOptionId) {
        const existing = childrenByParent.get(opt.parentOptionId) || [];
        existing.push(opt);
        childrenByParent.set(opt.parentOptionId, existing);
      }
    }

    const hierarchicalList: T[] = [];
    const visitedIds = new Set<string>();

    for (const opt of candidateOptions) {
      if (visitedIds.has(opt.id)) continue;

      if (!opt.parentOptionId || !optionMap.has(opt.parentOptionId)) {
        // This is a root / parent item (or an orphan variant whose parent is filtered out)
        visitedIds.add(opt.id);
        hierarchicalList.push(opt);

        // Append its child variants immediately below it
        const children = childrenByParent.get(opt.id) || [];
        for (const child of children) {
          if (!visitedIds.has(child.id)) {
            visitedIds.add(child.id);
            hierarchicalList.push(child);
          }
        }
      }
    }

    // Fallback in case any isolated variants remained unvisited
    for (const opt of candidateOptions) {
      if (!visitedIds.has(opt.id)) {
        visitedIds.add(opt.id);
        hierarchicalList.push(opt);
      }
    }

    return hierarchicalList;
  }, [options, searchTerm, includeDraftOptions]);

  useEffect(() => {
    if (isOpen) {
      if (value && filteredOptions.length > 0) {
        const foundIndex = filteredOptions.findIndex(
          (opt) =>
            opt.id === value ||
            (opt.code && opt.code.toLowerCase() === value.toLowerCase()) ||
            (opt.sku && opt.sku.toLowerCase() === value.toLowerCase()) ||
            opt.name.toLowerCase() === value.toLowerCase()
        );
        setHighlightedIndex(foundIndex >= 0 ? foundIndex : 0);
      } else {
        setHighlightedIndex(0);
      }
    }
  }, [isOpen, value, filteredOptions]);

  // Synchronous and responsive position calculation
  const calculatePosition = useCallback((): DropdownPosition | null => {
    if (!wrapperRef.current) return null;
    const rect = wrapperRef.current.getBoundingClientRect();
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;

    const dropdownWidth = Math.min(Math.max(rect.width || 260, 260), viewportWidth - 24);
    let left = rect.left || 0;
    if (left + dropdownWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - dropdownWidth - 12);
    }

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropdownEstimatedHeight = 280;

    if (spaceBelow < dropdownEstimatedHeight && spaceAbove > spaceBelow) {
      // Open upwards above trigger
      return {
        bottom: Math.max(0, viewportHeight - rect.top + 4),
        left,
        width: dropdownWidth,
      };
    } else {
      // Open downwards below trigger
      return {
        top: rect.bottom + 4,
        left,
        width: dropdownWidth,
      };
    }
  }, []);

  const toggleOpen = () => {
    if (disabled) return;
    if (!isOpen) {
      const pos = calculatePosition();
      setPosition(pos);
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setPosition(null);
    }
  };

  // Re-calculate position on scroll / window resize
  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      const pos = calculatePosition();
      if (pos) {
        setPosition(pos);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen, calculatePosition]);

  // Click outside detection across trigger and portal dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setPosition(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setPosition(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const defaultRenderOption = (opt: T) => {
    const isVar = Boolean(opt.isVariant || opt.parentOptionId);
    const parentItemName = opt.parentItemName || options?.find((candidate) => candidate.id === opt.parentOptionId)?.name;
    const displayName = isVar ? getVariantLabel(parentItemName, opt.name) : opt.name;
    return (
      <div
        className={clsx(
          'flex min-w-0 items-center gap-2',
          opt.parentOptionId ? 'ml-3 border-l-2 border-violet-300 pl-3 dark:border-violet-700' : ''
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 flex-wrap">
            <span
              className={clsx(
                'truncate flex items-center gap-1',
                isVar
                  ? 'text-xs font-medium text-foreground/90'
                  : size === 'sm'
                    ? 'text-xs font-semibold text-foreground'
                    : 'text-xs sm:text-sm font-semibold text-foreground'
              )}
            >
              {opt.parentOptionId && <span className="text-violet-500 font-bold select-none shrink-0" aria-hidden="true">↳</span>}
              <span>{displayName}</span>
            </span>
            {isVar && (
              <span className="shrink-0 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                Variant
              </span>
            )}
          </div>
          {((opt as any).category?.name || (showOptionCode && (opt.code || opt.sku))) && (
            <span className="block truncate text-[10px] text-muted-foreground font-mono mt-0.5">
              {[
                (opt as any).category?.name,
                showOptionCode ? opt.code || opt.sku : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
      </div>
    );
  };

  const dropdownMenu = isOpen && mounted && position && (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: position.top !== undefined ? `${position.top}px` : undefined,
        bottom: position.bottom !== undefined ? `${position.bottom}px` : undefined,
        left: `${position.left}px`,
        width: `${position.width}px`,
        zIndex: 999999,
      }}
      className="overflow-hidden bg-popover border border-border rounded-xl shadow-2xl animate-in fade-in-50 zoom-in-95 duration-100"
    >
      <div className="sticky top-0 bg-popover p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute inset-y-0 left-2.5 my-auto w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            className="w-full !min-h-[32px] h-8 py-1 pl-8 pr-3 text-xs border border-input rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-muted/30 text-foreground outline-none transition-colors"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex((prev) =>
                  filteredOptions.length > 0 ? (prev + 1) % filteredOptions.length : 0
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex((prev) =>
                  filteredOptions.length > 0 ? (prev - 1 + filteredOptions.length) % filteredOptions.length : 0
                );
              } else if (e.key === 'PageDown') {
                e.preventDefault();
                setHighlightedIndex((prev) =>
                  filteredOptions.length > 0 ? Math.min(prev + 5, filteredOptions.length - 1) : 0
                );
              } else if (e.key === 'PageUp') {
                e.preventDefault();
                setHighlightedIndex((prev) =>
                  filteredOptions.length > 0 ? Math.max(prev - 5, 0) : 0
                );
              } else if (e.key === 'Home' && (e.ctrlKey || e.metaKey || !searchTerm)) {
                e.preventDefault();
                setHighlightedIndex(0);
              } else if (e.key === 'End' && (e.ctrlKey || e.metaKey || !searchTerm)) {
                e.preventDefault();
                setHighlightedIndex(Math.max(0, filteredOptions.length - 1));
              } else if (e.key === 'ArrowRight' && !searchTerm) {
                e.preventDefault();
                setIsOpen(false);
                setPosition(null);
                const nextEl = findNextFocusable(buttonRef.current, 1);
                if (nextEl) {
                  requestAnimationFrame(() => nextEl.focus());
                }
              } else if (e.key === 'ArrowLeft' && !searchTerm) {
                e.preventDefault();
                setIsOpen(false);
                setPosition(null);
                const prevEl = findNextFocusable(buttonRef.current, -1);
                if (prevEl) {
                  requestAnimationFrame(() => prevEl.focus());
                }
              } else if (e.key === 'Enter') {
                e.stopPropagation();
                const opt = filteredOptions[highlightedIndex];
                if (opt && !opt.disabled) {
                  onChange(opt.id);
                  setIsOpen(false);
                  setPosition(null);
                  setSearchTerm('');
                  buttonRef.current?.focus();
                } else if (allowCustom && searchTerm.trim()) {
                  onChange(searchTerm.trim());
                  setIsOpen(false);
                  setPosition(null);
                  setSearchTerm('');
                  buttonRef.current?.focus();
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsOpen(false);
                setPosition(null);
                buttonRef.current?.focus();
              } else if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) {
                  setIsOpen(false);
                  setPosition(null);
                  const prevEl = findNextFocusable(buttonRef.current, -1);
                  if (prevEl) prevEl.focus();
                  else buttonRef.current?.focus();
                } else {
                  const opt = filteredOptions[highlightedIndex];
                  if (opt && !opt.disabled) {
                    onChange(opt.id);
                  } else if (allowCustom && searchTerm.trim()) {
                    onChange(searchTerm.trim());
                  }
                  setIsOpen(false);
                  setPosition(null);
                  setSearchTerm('');
                  const nextEl = findNextFocusable(buttonRef.current, 1);
                  if (nextEl) {
                    requestAnimationFrame(() => {
                      nextEl.focus();
                    });
                  }
                }
              }
            }}
            autoFocus
          />
        </div>
      </div>

      <ul ref={listRef} className="py-1 max-h-64 overflow-y-auto divide-y divide-border/30">
        {isLoading ? (
          <li className="px-3 py-2.5 text-xs text-muted-foreground text-center">Loading options...</li>
        ) : filteredOptions.length === 0 && !allowCustom ? (
          <li className="px-3 py-3 text-xs text-muted-foreground text-center">No matching records found.</li>
        ) : (
          <>
            {filteredOptions.map((option, idx) => {
              const isSelected = multiple
                ? selectedValues.includes(option.id)
                : value === option.id ||
                (option.code && option.code.toLowerCase() === (value || '').toLowerCase()) ||
                (option.sku && option.sku.toLowerCase() === (value || '').toLowerCase()) ||
                option.name.toLowerCase() === (value || '').toLowerCase();
              const isHighlighted = idx === highlightedIndex;
              return (
                <li
                  key={option.id}
                  aria-selected={isSelected || isHighlighted}
                  className={clsx(
                    'px-3 py-2 cursor-pointer transition-colors text-xs flex items-center justify-between gap-2',
                    isHighlighted
                      ? 'bg-primary/15 text-primary font-bold border-l-2 border-primary shadow-2xs'
                      : isSelected
                        ? 'bg-primary/10 font-semibold text-primary'
                        : option.parentOptionId
                          ? 'text-foreground hover:bg-violet-50/80 dark:hover:bg-violet-950/20'
                        : 'text-foreground hover:bg-muted/60',
                    option.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent'
                  )}
                  onMouseEnter={() => !option.disabled && setHighlightedIndex(idx)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (option.disabled) return;
                    if (multiple) {
                      const nextValues = isSelected
                        ? selectedValues.filter((id) => id !== option.id)
                        : [...selectedValues, option.id];
                      onMultiChange?.(nextValues);
                    } else {
                      onChange(option.id);
                      setIsOpen(false);
                      setPosition(null);
                      setSearchTerm('');
                    }
                    buttonRef.current?.focus();
                  }}
                >
                  <div className="flex-1 truncate">
                    {renderOption ? renderOption(option) : defaultRenderOption(option)}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </li>
              );
            })}

            {allowCustom &&
              searchTerm.trim() &&
              !filteredOptions.some(
                (o) => o.name.toLowerCase() === searchTerm.trim().toLowerCase()
              ) && (
                <li
                  className="px-3 py-2 cursor-pointer transition-colors text-xs flex items-center justify-between gap-2 text-primary hover:bg-primary/10 border-t border-border/50 font-semibold"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(searchTerm.trim());
                    setIsOpen(false);
                    setPosition(null);
                    setSearchTerm('');
                  }}
                >
                  <span className="truncate">Use &ldquo;{searchTerm.trim()}&rdquo;</span>
                  <Check className="w-3.5 h-3.5 text-primary shrink-0 opacity-70" />
                </li>
              )}
          </>
        )}
      </ul>
      {onAddNew && (
        <div className="sticky bottom-0 bg-popover p-1.5 border-t border-border">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsOpen(false);
              setPosition(null);
              onAddNew();
            }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{addNewText ? `Add new ${addNewText}` : 'Add new'}</span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div ref={wrapperRef} className={clsx('w-full', label && 'space-y-1.5', className)}>
        {label && (
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-foreground/85 tracking-tight">
              {label}
            </label>
            {onAddNew && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddNew();
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline hover:text-primary/80 transition-colors cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>{addNewText ? `Add ${addNewText}` : 'Add new'}</span>
              </button>
            )}
          </div>
        )}
        <button
          ref={buttonRef}
          type="button"
          className={clsx(
            'flex items-center justify-between w-full border bg-background/70 hover:bg-background text-foreground cursor-pointer transition-all duration-150 text-left outline-none shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary',
            size === 'sm' ? '!min-h-[36px] h-9 px-2.5 rounded-lg text-xs' : 'h-10 px-3.5 rounded-xl text-xs sm:text-sm font-medium',
            disabled ? 'opacity-50 cursor-not-allowed bg-muted/40' : 'hover:border-border/90',
            isOpen ? 'border-primary ring-2 ring-primary/15 bg-background' : 'border-border/70',
            error ? 'border-destructive ring-2 ring-destructive/15' : ''
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleOpen();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggleOpen();
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              toggleOpen();
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              const nextEl = findNextFocusable(buttonRef.current, 1);
              if (nextEl) nextEl.focus();
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              const prevEl = findNextFocusable(buttonRef.current, -1);
              if (prevEl) prevEl.focus();
            }
          }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <div className={clsx('flex-1 truncate', size === 'sm' ? 'text-xs' : 'text-xs sm:text-sm font-medium')}>
            {isLoading ? (
              <span className="text-muted-foreground/60">Loading options...</span>
            ) : multiple ? (
              selectedValues.length ? (
                <span className="truncate text-foreground">
                  {selectedValues
                    .map((id) => options?.find((option) => option.id === id)?.name)
                    .filter(Boolean)
                    .join(', ')}
                </span>
              ) : <span className="text-muted-foreground/45">{placeholder}</span>
            ) : selectedOption && renderSelectedOption ? (
              renderSelectedOption(selectedOption)
            ) : selectedOption ? (
              <span className="flex min-w-0 items-center gap-1.5 text-foreground">
                <span className="truncate">
                  {selectedOption.isVariant || selectedOption.parentOptionId
                    ? formatVariantName(selectedOption.parentItemName || options?.find((option) => option.id === selectedOption.parentOptionId)?.name, selectedOption.name)
                    : selectedOption.name || selectedOption.code || selectedOption.sku || value}
                </span>
                {(selectedOption.isVariant || selectedOption.parentOptionId) && <VariantBadge />}
              </span>
            ) : (
              <span className="text-muted-foreground/45">{placeholder}</span>
            )}
          </div>
          <div className="flex items-center gap-1 ml-1.5 shrink-0">
            {clearable && selectedOption && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                className="p-0.5 rounded text-muted-foreground/60 hover:text-destructive hover:bg-muted/80 transition-colors cursor-pointer"
                title="Clear selection"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange('');
                  if (onClear) onClear();
                }}
              >
                <X className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
              </span>
            )}
            <ChevronDown
              className={clsx(
                'text-muted-foreground/70 shrink-0 transition-transform duration-150',
                size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4',
                isOpen && 'rotate-180 text-primary'
              )}
            />
          </div>
        </button>

        {error && (
          <p className="mt-1 text-xs text-destructive font-medium">
            {typeof error === 'string' ? error : 'Failed to load options.'}
          </p>
        )}
      </div>

      {mounted && typeof document !== 'undefined' && dropdownMenu && createPortal(dropdownMenu, document.body)}
    </>
  );
}
