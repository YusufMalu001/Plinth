import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Search, ChevronDown, Check, X, Layers, Loader2 } from 'lucide-react';

export interface BomSelectorOption {
 id: string;
 name: string;
 code?: string;
 status?: string;
 productName?: string;
 productSku?: string;
 lineCount?: number;
}

interface MultiBomSelectorProps {
 selectedIds: string[];
 onToggle: (id: string) => void;
 onClear?: () => void;
 options: BomSelectorOption[] | undefined;
 isLoading?: boolean;
 disabled?: boolean;
 placeholder?: string;
 className?: string;
 size?: 'sm' | 'md';
}

interface DropdownPosition {
 top?: number;
 bottom?: number;
 left: number;
 width: number;
}

export function MultiBomSelector({
 selectedIds = [],
 onToggle,
 onClear,
 options = [],
 isLoading = false,
 disabled = false,
 placeholder = 'Choose existing BOM(s)...',
 className,
 size = 'sm',
}: MultiBomSelectorProps) {
 const [isOpen, setIsOpen] = useState(false);
 const [searchTerm, setSearchTerm] = useState('');
 const [mounted, setMounted] = useState(false);
 const [position, setPosition] = useState<DropdownPosition | null>(null);

 const wrapperRef = useRef<HTMLDivElement>(null);
 const dropdownRef = useRef<HTMLDivElement>(null);
 const searchInputRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 setMounted(true);
 }, []);

 const calculatePosition = useCallback((): DropdownPosition | null => {
 if (!wrapperRef.current) return null;
 const rect = wrapperRef.current.getBoundingClientRect();
 const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
 const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;

 const horizontalMargin = 12;
 const dropdownWidth = Math.max(0, Math.min(Math.max(rect.width || 320, 320), 420, viewportWidth - horizontalMargin * 2));
 const left = Math.min(Math.max(rect.left, horizontalMargin), viewportWidth - dropdownWidth - horizontalMargin);
 const dropdownHeight = Math.min(dropdownRef.current?.offsetHeight || 360, viewportHeight - horizontalMargin * 2);
 const spaceBelow = viewportHeight - rect.bottom - horizontalMargin;
 const spaceAbove = rect.top - horizontalMargin;

 if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
 return {
 bottom: Math.max(horizontalMargin, Math.min(viewportHeight - rect.top + 4, viewportHeight - horizontalMargin)),
 left,
 width: dropdownWidth,
 };
 } else {
 return {
 top: Math.max(horizontalMargin, Math.min(rect.bottom + 4, viewportHeight - dropdownHeight - horizontalMargin)),
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
 setTimeout(() => {
 searchInputRef.current?.focus();
 }, 50);
 } else {
 setIsOpen(false);
 setPosition(null);
 }
 };

 useEffect(() => {
 if (!isOpen) return;

 const initialPosition = calculatePosition();
 if (initialPosition) setPosition(initialPosition);

 const handleResize = () => {
 const pos = calculatePosition();
 if (pos) setPosition(pos);
 };
 const handlePageScroll = (event: Event) => {
 const target = event.target;
 if (target instanceof Node && dropdownRef.current?.contains(target)) return;
 setIsOpen(false);
 setPosition(null);
 };

 window.addEventListener('resize', handleResize);
 document.addEventListener('scroll', handlePageScroll, true);

 return () => {
 window.removeEventListener('resize', handleResize);
 document.removeEventListener('scroll', handlePageScroll, true);
 };
 }, [isOpen, calculatePosition]);

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

 const filteredOptions = useMemo(() => {
 if (!options) return [];
 if (!searchTerm.trim()) return options;
 const term = searchTerm.toLowerCase();
 return options.filter(
 (opt) =>
 opt.name.toLowerCase().includes(term) ||
 (opt.code && opt.code.toLowerCase().includes(term)) ||
 (opt.productSku && opt.productSku.toLowerCase().includes(term)) ||
 (opt.productName && opt.productName.toLowerCase().includes(term))
 );
 }, [options, searchTerm]);

 const selectedCount = selectedIds.length;

 const dropdownMenu = (
 <div
 ref={dropdownRef}
 style={{
 position: 'fixed',
 top: position?.top !== undefined ? `${position.top}px` : 'auto',
 bottom: position?.bottom !== undefined ? `${position.bottom}px` : 'auto',
 left: `${position?.left || 0}px`,
 width: `${position?.width || 320}px`,
 maxHeight: 'calc(100vh - 24px)',
 overscrollBehavior: 'contain',
 zIndex: 99999,
 }}
 onWheel={(event) => {
 event.stopPropagation();
 const list = dropdownRef.current?.querySelector<HTMLElement>('[data-bom-options-list]');
 if (!list) {
 event.preventDefault();
 return;
 }
 const atTop = list.scrollTop <= 0;
 const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
 if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
 event.preventDefault();
 }
 }}
 className="bg-white border border-border rounded-xl shadow-xl overflow-hidden flex flex-col text-ink animate-in fade-in zoom-in-95 duration-100"
 >
 {/* Search Input */}
 <div className="p-2 border-b border-border/80 ">
 <div className="relative flex items-center">
 <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 pointer-events-none" />
 <input
 ref={searchInputRef}
 type="text"
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder="Search existing BOMs..."
 className="w-full h-8 pl-8 pr-7 text-xs bg-muted border border-border rounded-lg text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
 />
 {searchTerm && (
 <button
 type="button"
 onClick={() => setSearchTerm('')}
 className="absolute right-2 text-ink-muted hover:text-ink-secondary p-0.5"
 >
 <X className="w-3 h-3" />
 </button>
 )}
 </div>
 </div>

 {/* Header Info & Clear */}
 <div className="flex items-center justify-between px-3 py-1.5 bg-muted border-b border-border/60 text-[11px] text-ink-secondary font-medium">
 <span>Select BOM(s) to append recipe lines</span>
 {selectedCount > 0 && onClear && (
 <button
 type="button"
 onClick={onClear}
 className="text-primary hover:underline font-semibold cursor-pointer"
 >
 Clear Selected ({selectedCount})
 </button>
 )}
 </div>

 {/* Options List */}
 <div data-bom-options-list className="max-h-60 min-h-0 shrink overflow-y-auto overscroll-y-contain divide-y divide-border p-1">
 {isLoading ? (
 <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-ink-muted">
 <Loader2 className="w-4 h-4 animate-spin text-primary" />
 <span>Loading BOMs...</span>
 </div>
 ) : filteredOptions.length === 0 ? (
 <div className="py-6 text-center text-xs text-ink-muted">
 {searchTerm ? `No BOMs matching "${searchTerm}"` : 'No existing BOMs available.'}
 </div>
 ) : (
 filteredOptions.map((opt) => {
 const isSelected = selectedIds.includes(opt.id);
 return (
 <div
 key={opt.id}
 onClick={() => onToggle(opt.id)}
 className={clsx(
 'flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-xs select-none',
 isSelected
 ? 'bg-primary/10 text-primary font-medium'
 : 'text-ink hover:bg-muted '
 )}
 >
 <div
 className={clsx(
 'w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors',
 isSelected
 ? 'bg-primary border-primary text-white shadow-2xs'
 : 'border-border-strong bg-white '
 )}
 >
 {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
 </div>

 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-1.5">
 <span className="font-semibold text-ink truncate">
 {opt.name}
 </span>
 {opt.code && (
 <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-active/80 text-ink-secondary shrink-0">
 {opt.code}
 </span>
 )}
 </div>
 {(opt.productName || opt.productSku) && (
 <div className="text-[11px] text-ink-muted truncate mt-0.5">
 Target: {opt.productName || opt.productSku}
 </div>
 )}
 </div>
 </div>
 );
 })
 )}
 </div>

 {/* Footer */}
 <div className="px-3 py-2 border-t border-border/80 bg-muted flex items-center justify-between">
 <span className="text-[10px] text-ink-muted">
 {selectedCount > 0
 ? `${selectedCount} BOM${selectedCount > 1 ? 's' : ''} chosen · lines appended`
 : 'Multi-select multiple BOMs'}
 </span>
 <button
 type="button"
 onClick={() => {
 setIsOpen(false);
 setPosition(null);
 }}
 className="px-3 py-1 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
 >
 Done
 </button>
 </div>
 </div>
 );

 return (
 <div ref={wrapperRef} className={clsx('relative w-full', className)}>
 <button
 type="button"
 onClick={toggleOpen}
 disabled={disabled}
 className={clsx(
 'flex items-center justify-between w-full border bg-white text-foreground cursor-pointer transition-all duration-150 text-left outline-none shadow-2xs',
 size === 'sm' ? 'h-9 px-3 rounded-xl text-xs font-semibold' : 'h-10 px-3.5 rounded-xl text-xs font-semibold',
 disabled ? 'opacity-50 cursor-not-allowed bg-muted/40' : 'hover:border-border-strong ',
 isOpen ? 'border-primary ring-2 ring-primary/20 bg-white ' : 'border-border-strong ',
 selectedCount > 0 && '!border-primary/50 bg-primary/5'
 )}
 >
 <div className="flex items-center gap-1.5 truncate pr-1">
 {selectedCount > 0 ? (
 <span className="inline-flex items-center gap-1.5 font-bold text-primary truncate">
 <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
 <span>{selectedCount} BOM{selectedCount > 1 ? 's' : ''} Selected</span>
 </span>
 ) : (
 <span className="text-ink-muted font-medium truncate">
 {placeholder}
 </span>
 )}
 </div>

 <div className="flex items-center gap-1 shrink-0 ml-1.5">
 {selectedCount > 0 && onClear && (
 <span
 role="button"
 tabIndex={0}
 onClick={(e) => {
 e.stopPropagation();
 onClear();
 }}
 className="p-0.5 rounded-md text-ink-muted hover:text-destructive hover:bg-muted transition-colors cursor-pointer"
 title="Clear BOM selection"
 >
 <X className="w-3 h-3" />
 </span>
 )}
 {isLoading ? (
 <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-muted" />
 ) : (
 <ChevronDown className={clsx('w-3.5 h-3.5 text-ink-muted transition-transform duration-200', isOpen && 'rotate-180')} />
 )}
 </div>
 </button>

 {isOpen && mounted && position && createPortal(dropdownMenu, document.body)}
 </div>
 );
}
