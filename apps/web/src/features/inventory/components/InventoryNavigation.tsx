"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
 LayoutDashboard,
 RefreshCw,
 PackageCheck
} from 'lucide-react';

interface TabItem {
 id: string;
 label: string;
 href: string;
 icon: React.ElementType;
 badge?: string | number;
}

const TABS: TabItem[] = [
 { id: 'overview', label: 'Inventory Dashboard', href: '/inventory', icon: LayoutDashboard },
 { id: 'fg-receipts', label: 'Finished Goods', href: '/inventory/fg-receipts', icon: PackageCheck },
];

interface InventoryNavigationProps {
 title: string;
 description: string;
 activeKey?: string;
 actions?: React.ReactNode;
 onRefresh?: () => void;
 isRefreshing?: boolean;
}

export function InventoryNavigation({
 title,
 description,
 activeKey,
 actions,
 onRefresh,
 isRefreshing = false,
}: InventoryNavigationProps) {
 const pathname = usePathname();

 const currentActive = activeKey || (() => {
 if (pathname.startsWith('/inventory/fg-receipts')) return 'fg-receipts';
 return 'overview';
 })();

 return (
 <div className="space-y-4">
 {/* Top Header & Actions */}
 <div className="flex flex-wrap items-center justify-between gap-4">
 <div>
 <h1 className="text-2xl font-bold tracking-tight text-ink ">
 {title}
 </h1>
 <p className="text-xs sm:text-sm text-ink-secondary mt-1 max-w-3xl">
 {description}
 </p>
 </div>

 <div className="flex items-center gap-2.5">
 {onRefresh && (
 <button
 type="button"
 onClick={onRefresh}
 disabled={isRefreshing}
 className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold text-ink-secondary hover:bg-[var(--accent-blue)]/5 hover:border-[var(--accent-blue)]/30 transition-colors shadow-2xs"
 >
 <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-[var(--accent-blue)]' : 'text-ink-muted'}`} />
 <span>{isRefreshing ? 'Syncing...' : 'Live Sync'}</span>
 </button>
 )}

 {actions}
 </div>
 </div>

 {/* Sub-Navigation Tabs Bar */}
 <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-border ">
 {TABS.map((tab) => {
 const isActive = currentActive === tab.id;
 const Icon = tab.icon;

 return (
 <Link
 key={tab.id}
 href={tab.href}
 className={`group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm whitespace-nowrap transition-all duration-150 ${
 isActive
 ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border border-[var(--accent-blue)]/30 shadow-2xs font-extrabold'
 : 'text-ink-secondary hover:text-ink hover:bg-muted/80 border border-transparent font-bold'
 }`}
 >
 <Icon className={`h-4.5 w-4.5 transition-transform group-hover:scale-105 ${
 isActive ? 'text-[var(--accent-blue)] ' : 'text-ink-muted group-hover:text-ink-secondary'
 }`} />
 <span>{tab.label}</span>
 {tab.badge && (
 <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-black ${
 isActive
 ? 'bg-[var(--accent-blue)] text-white'
 : 'bg-active text-ink-secondary'
 }`}>
 {tab.badge}
 </span>
 )}
 </Link>
 );
 })}
 </div>
 </div>
 );
}
