'use client';

import React, { useEffect, useState } from 'react';
import { Logo, PlinthMark } from '../config/brand';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
 LayoutDashboard,
 CalendarDays,
 TrendingUp,
 Package,
 ChevronRight,
 ShieldCheck,
 Truck,
 Factory,
 Box,
 Bell,
 PanelLeftClose,
 PanelLeftOpen,
 PackageCheck,
 X,
 Landmark,
 Trash2,
 Sparkles,
 Users,
} from 'lucide-react';
import { useNotifications } from './NotificationCenter';
import { canViewPath } from '../features/auth/access-control';

interface SidebarSubItem {
 label: string;
 href: string;
 badge?: string;
 subItems?: SidebarSubItem[];
}

interface SidebarItem {
 id: string;
 label: string;
 href?: string;
 icon: React.ElementType;
 subItems?: SidebarSubItem[];
 badge?: string;
}

interface SidebarSection {
 title: string;
 items: SidebarItem[];
}

interface SidebarProps {
 userRole: string;
 permissions?: string[];
 isCollapsed?: boolean;
 onToggle?: () => void;
 isMobileOpen?: boolean;
 onMobileClose?: () => void;
 isAssemblyUser?: boolean;
}

const primarySection: SidebarSection = {
 title: 'Main Platform',
 items: [
 { id: 'dashboard', label: 'Dashboard', href: '/', icon: LayoutDashboard },
 {
 id: 'intelligence',
 label: 'Intelligence',
 href: '/intelligence',
 icon: Sparkles,
 subItems: [
 { label: 'AI Analytics', href: '/intelligence' },
 { label: 'AI Insights', href: '/intelligence/insights' },
 { label: 'Recommendations', href: '/intelligence/recommendations' },
 { label: 'Tasks & Cases', href: '/intelligence/tasks' },
 { label: 'AI Advisor', href: '/intelligence/advisor' },
 { label: 'Advisor History', href: '/intelligence/history' },
 ],
 },
 { id: 'calendar', label: 'Operations Calendar', href: '/calendar', icon: CalendarDays },
 {
 id: 'products',
 label: 'Inventory',
 href: '/products',
 icon: Box,
 subItems: [
 { label: 'Inventory Items', href: '/products' },
 { label: 'Pricing Masters', href: '/products/pricing-masters' },
 {
 label: 'Categories',
 href: '/products/categories',
 subItems: [
 { label: 'Parent Categories', href: '/products/categories?tab=parents' },
 { label: 'Sub Categories', href: '/products/categories?tab=subcategories' },
 ],
 },
 { label: 'Units of Measure', href: '/inventory/uom' },
 { label: 'BOM', href: '/production/bom' },
 ],
 },
 ],
};

const supplyChainSection: SidebarSection = {
 title: 'Supply Chain & Receiving',
 items: [
 {
 id: 'procurement',
 label: 'Procurement',
 href: '/procurement/purchase-orders',
 icon: PackageCheck,
 subItems: [
 { label: 'Purchase Orders', href: '/procurement/purchase-orders' },
 { label: 'Goods Receipts', href: '/receiving/goods-receipts' },
 { label: 'Vendor Directory', href: '/vendors' },
 ],
 },
 ],
};

const operationsSection: SidebarSection = {
 title: 'Plant & Operations',
 items: [
 {
 id: 'inventory',
 label: 'Warehouse & Stock',
 href: '/inventory',
 icon: Package,
 subItems: [
 { label: 'Inventory Dashboard', href: '/inventory' },
 { label: 'Finished Goods', href: '/inventory/fg-receipts' },
 { label: 'Stock Ledger', href: '/stock/ledger' },
 { label: 'Stock Issues', href: '/stock/issues' },
 { label: 'Stock Adjustments', href: '/stock/adjustments' },
 { label: 'Reorder Signals', href: '/stock/reorder' },
 ],
 },
 {
 id: 'production',
 label: 'Manufacturing & Plant',
 href: '/production',
 icon: Factory,
 subItems: [
 { label: 'Production Overview', href: '/production' },
 { label: 'Production Execution', href: '/production/execution' },
 { label: 'Assembly & Convergence', href: '/production/assembly' },
 { label: 'WIP & Batch Tracking', href: '/production/wip' },
 { label: 'Shop Floor Routes', href: '/inventory/routing' },
 { label: 'Job Work & Outsourcing', href: '/job-work' },
 ],
 },
 {
 id: 'quality',
 label: 'Quality & Inspection',
 href: '/quality',
 icon: ShieldCheck,
 subItems: [
 { label: 'Inspection Queue', href: '/quality' },
 { label: 'Quality History', href: '/quality/history' },
 { label: 'QC Rules & Criteria', href: '/quality/rules' },
 ],
 },
 {
 id: 'scrap-wastage',
 label: 'Scrap & Wastage',
 href: '/scrap-wastage',
 icon: Trash2,
 subItems: [
 { label: 'Scrap & Loss Dashboard', href: '/scrap-wastage' },
 { label: 'Loss Events & Ledger', href: '/scrap-wastage/ledger' },
 { label: 'Abnormal Review Queue', href: '/scrap-wastage/abnormal-queue' },
 { label: 'Replacement Challans', href: '/scrap-wastage/replacements' },
 ],
 },
 {
 id: 'sales',
 label: 'Sales & Orders',
 href: '/sales',
 icon: TrendingUp,
 subItems: [
 { label: 'Sales Control Center', href: '/sales' },
 { label: 'Credit Hold Queue', href: '/sales/hold-queue' },
 { label: 'Customers & Dealers', href: '/sales/customers' },
 { label: 'Store POS', href: '/sales/pos' },
 { label: 'Amazon Channel Sync', href: '/sales/amazon' },
 ],
 },
 {
 id: 'dispatch',
 label: 'Logistics & Dispatch',
 href: '/dispatch',
 icon: Truck,
 subItems: [
 { label: 'Dispatch Overview', href: '/dispatch' },
 { label: 'Allocation Workbench', href: '/dispatch/allocation' },
 { label: 'Picking Workbench', href: '/dispatch/picking' },
 { label: 'Packaging Workstation', href: '/dispatch/packing' },
 { label: 'Dispatch Staging', href: '/dispatch/staging' },
 { label: 'Manifests & Gate Handover', href: '/dispatch/manifests' },
 { label: 'Dispatched Shipments', href: '/dispatch/dispatched' },
 { label: 'Delivery & POD', href: '/dispatch/delivery' },
 { label: 'Carrier Administration', href: '/dispatch/carriers' },
 { label: 'Reverse Logistics & Returns', href: '/sales/returns' },
 ],
 },
 ],
};

const financeSection: SidebarSection = {
 title: 'Finance & Accounts',
 items: [
 {
 id: 'accounts',
 label: 'Accounts',
 href: '/accounts',
 icon: Landmark,
 subItems: [
 { label: 'Ledger Overview', href: '/accounts' },
 { label: 'Purchases & Payables', href: '/accounts/purchases' },
 { label: 'Sales & Invoices', href: '/accounts/sales' },
 { label: 'Pro Formas', href: '/accounts/pro-formas' },
 { label: 'Debit Notes', href: '/accounts/debit-notes' },
 { label: 'Credit Notes', href: '/accounts/credit-notes' },
 { label: 'Miscellaneous Expenses', href: '/accounts/expenses' },
 { label: 'Journal Vouchers', href: '/accounts/journals' },
 { label: 'Payments & Receipts', href: '/accounts/payments' },
 { label: 'Bank & Contra', href: '/accounts/banking' },
 { label: 'Marketplace Recon', href: '/accounts/marketplace' },
 { label: 'GST Workbench', href: '/accounts/gst' },
 { label: 'Reports & Close', href: '/accounts/reports' },
 { label: 'Tally Exchange', href: '/accounts/tally' },
 ],
 },
 {
 id: 'finance',
 label: 'Tally Integration',
 href: '/finance',
 icon: Landmark,
 subItems: [
 { label: 'Readiness Matrix', href: '/finance' },
 { label: 'Mapping Rules', href: '/finance/mappings' },
 { label: 'Eligible Queue', href: '/finance/queue' },
 { label: 'Export Runs', href: '/finance/exports' },
 { label: 'Error & Retries', href: '/finance/errors' },
 { label: 'Internal Reconciliation', href: '/finance/reconciliation' },
 ],
 },
 ],
};

const hrSection: SidebarSection = {
 title: 'Human Resources',
 items: [
 {
 id: 'hr',
 label: 'HR Module',
 href: '/hr',
 icon: Users,
 subItems: [
 { label: 'Reports & Analysis', href: '/hr' },
 { label: 'Employee Directory', href: '/hr/directory' },
 { label: 'Onboarding Tracking', href: '/hr/onboarding' },
 { label: 'Task Queue & Validation', href: '/hr/tasks' },
 { label: 'My Attendance & Leaves', href: '/attendance' },
 ],
 },
 ],
};

const EXACT_NAV_PATHS = new Set([
 '/',
 '/receiving',
 '/procurement',
 '/inventory',
 '/production',
 '/quality',
 '/finance',
 '/products',
 '/sales',
 '/dispatch',
 '/decision-center',
 '/intelligence',
]);

function NavItem({
 item,
 collapsed,
 pathname,
 expanded,
 onExpand,
 onNavigate,
}: {
 item: SidebarItem;
 collapsed: boolean;
 pathname: string;
 expanded: boolean;
 onExpand: () => void;
 onNavigate?: () => void;
}) {
 const currentSearch = useSearchParams().toString();
 const pathActive = (href: string) => {
 const [path, query] = href.split('?');
 const routeMatches = EXACT_NAV_PATHS.has(path)
 ? pathname === path
 : pathname === path || pathname.startsWith(`${path}/`);
 if (!routeMatches || !query) return routeMatches;
 const expectedParams = new URLSearchParams(query);
 const currentParams = new URLSearchParams(currentSearch);
 return [...expectedParams.entries()].every(([key, value]) => currentParams.get(key) === value);
 };
 const [expandedSubItems, setExpandedSubItems] = useState<Record<string, boolean>>({});

 const Icon = item.icon;
 const hasChildren = Boolean(item.subItems?.length);
 const childActive = item.subItems?.some((child) =>
 child.subItems?.length ? child.subItems.some((nested) => pathActive(nested.href)) : pathActive(child.href)
 ) ?? false;
 const active =
 item.href === '/'
 ? pathname === '/'
 : item.id === 'production' && pathname.startsWith('/production/bom')
 ? false
 : Boolean(item.href && pathname.startsWith(item.href)) || childActive;

 const buttonClasses = `group relative flex w-full items-center transition-all duration-150 select-none ${collapsed
 ? 'h-10 w-10 mx-auto justify-center rounded-xl my-1'
 : 'justify-between rounded-xl px-3 py-2.5 my-0.5'
 } ${active
 ? collapsed
 ? 'bg-surface-muted text-ink font-black'
 : 'bg-surface-muted text-ink font-black border-l-4 border-l-border-strong'
 : 'text-ink font-extrabold hover:bg-muted hover:text-black hover:translate-x-0.5'
 }`;

 return (
 <div className="relative w-full">
 {hasChildren ? (
 <Link
 href={item.href ?? '#'}
 title={collapsed ? item.label : undefined}
 onClick={(event) => {
 // When the parent route is already active, the first click should
 // expand/collapse the branch instead of reloading the same page.
 // From another route, preserve the normal navigation to the
 // parent while opening its branch.
 if (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
 event.preventDefault();
 }
 onExpand();
 }}
 className={buttonClasses}
 >
 <div className="flex items-center gap-3 min-w-0">
 <div
 className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${active
 ? 'bg-surface-muted text-ink'
 : 'text-ink group-hover:text-black '
 }`}
 >
 <Icon size={17} strokeWidth={2.2} />
 </div>

 {!collapsed && (
 <span className="text-[14.5px] font-extrabold tracking-tight truncate text-inherit">
 {item.label}
 </span>
 )}
 </div>

 {!collapsed && (
 <div className="flex items-center gap-1.5 shrink-0">
 {item.badge && (
 <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-black text-ink uppercase tracking-wider">
 {item.badge}
 </span>
 )}
 <ChevronRight
 size={16}
 strokeWidth={2.5}
 className={`transition-transform duration-200 ${expanded ? 'rotate-90 text-ink' : 'text-ink '
 }`}
 />
 </div>
 )}
 </Link>
 ) : (
 <Link
 href={item.href ?? '#'}
 title={collapsed ? item.label : undefined}
 onClick={onNavigate}
 className={buttonClasses}
 >
 <div className="flex items-center gap-3 min-w-0">
 <div
 className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${active
 ? 'bg-surface-muted text-ink'
 : 'text-ink group-hover:text-black '
 }`}
 >
 <Icon size={18} strokeWidth={2.2} />
 </div>

 {!collapsed && (
 <span className="text-[14.5px] font-extrabold tracking-tight truncate text-inherit">
 {item.label}
 </span>
 )}
 </div>

 {!collapsed && item.badge && (
 <span className="rounded-full bg-active border border-border-strong px-2 py-0.5 text-[10px] font-black text-ink uppercase tracking-wider ">
 {item.badge}
 </span>
 )}
 </Link>
 )}

 {/* Expanded Submenu Branch */}
 {!collapsed && hasChildren && expanded && (
 <div className="ml-6 pl-2.5 border-l-2 border-border mt-1 mb-2 space-y-0.5">
 {item.subItems!.map((child) => {
 const nestedActive = child.subItems?.some((nested) => pathActive(nested.href)) ?? false;
 const childIsActive = child.subItems?.length ? nestedActive : pathActive(child.href);
 const nestedExpanded = expandedSubItems[child.label] ?? nestedActive;
 if (child.subItems?.length) {
 return (
 <React.Fragment key={child.href}>
 <button
 type="button"
 aria-expanded={nestedExpanded}
 onClick={() => setExpandedSubItems((current) => ({ ...current, [child.label]: !nestedExpanded }))}
 className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] transition-all ${childIsActive
 ? 'bg-surface-muted text-ink font-black'
 : 'text-ink font-bold hover:bg-muted hover:text-black '
 }`}
 >
 <span className="truncate">{child.label}</span>
 <ChevronRight size={14} className={`shrink-0 transition-transform ${nestedExpanded ? 'rotate-90' : ''}`} />
 </button>
 {nestedExpanded && (
 <div className="ml-3 space-y-0.5 border-l border-border pl-2 ">
 {child.subItems.map((nested) => {
 const nestedIsActive = pathActive(nested.href);
 return (
 <Link
 key={nested.href}
 href={nested.href}
 onClick={onNavigate}
 className={`block rounded-lg px-3 py-1.5 text-[12.5px] transition-all ${nestedIsActive
 ? 'bg-surface-muted text-ink font-black'
 : 'text-ink-secondary font-semibold hover:bg-muted '
 }`}
 >
 <span className="truncate">{nested.label}</span>
 </Link>
 );
 })}
 </div>
 )}
 </React.Fragment>
 );
 }
 return (
 <Link
 key={child.href}
 href={child.href}
 onClick={onNavigate}
 className={`group flex items-center justify-between rounded-lg px-3 py-2 text-[13.5px] transition-all ${childIsActive
 ? 'bg-surface-muted text-ink font-black'
 : 'text-ink font-bold hover:bg-muted hover:text-black '
 }`}
 >
 <span className="truncate">{child.label}</span>
 {child.badge && (
 <span className="rounded-full bg-surface-muted px-1.5 py-0.2 text-[9.5px] font-black uppercase text-ink">
 {child.badge}
 </span>
 )}
 </Link>
 );
 })}
 </div>
 )}
 </div>
 );
}

export function Sidebar({
 userRole,
 permissions = [],
 isCollapsed = false,
 onToggle,
 isMobileOpen = false,
 onMobileClose,
 isAssemblyUser = false,
}: SidebarProps) {
 const pathname = usePathname();
 const { unreadCount } = useNotifications();

 const procurementActive =
 pathname.startsWith('/procurement') ||
 pathname.startsWith('/vendors') ||
 pathname.startsWith('/debit-notes');
 const receivingActive = pathname.startsWith('/receiving');
 const productsActive =
 pathname.startsWith('/products') ||
 pathname.startsWith('/inventory/products') ||
 pathname.startsWith('/inventory/materials') ||
 pathname.startsWith('/inventory/uom') ||
 pathname.startsWith('/production/bom');
 const inventoryActive = pathname.startsWith('/inventory') || pathname.startsWith('/stock');
 const productionActive =
 (pathname.startsWith('/production') && !pathname.startsWith('/production/bom')) ||
 pathname.startsWith('/job-work');
 const qualityActive = pathname.startsWith('/quality');
 const scrapWastageActive = pathname.startsWith('/scrap-wastage');
 const dispatchActive =
 pathname.startsWith('/dispatch') ||
 pathname.startsWith('/sales/allocation') ||
 pathname.startsWith('/sales/packing') ||
 pathname.startsWith('/sales/dispatch') ||
 pathname.startsWith('/sales/returns');
 const salesActive =
 pathname.startsWith('/sales') &&
 !pathname.startsWith('/sales/allocation') &&
 !pathname.startsWith('/sales/packing') &&
 !pathname.startsWith('/sales/dispatch') &&
 !pathname.startsWith('/sales/returns');
 const financeActive = pathname.startsWith('/finance');
 const accountsActive = pathname.startsWith('/accounts');
 const intelligenceActive = pathname.startsWith('/intelligence') || pathname.startsWith('/decision-center');
 const hrActive = pathname.startsWith('/hr') || pathname.startsWith('/onboarding');
 const goodReceivingActive = procurementActive || receivingActive;
 const [goodReceivingExpanded, setGoodReceivingExpanded] = useState(goodReceivingActive);
 const [productsExpanded, setProductsExpanded] = useState(productsActive);
 const [intelligenceExpanded, setIntelligenceExpanded] = useState(intelligenceActive);
 const [inventoryExpanded, setInventoryExpanded] = useState(inventoryActive);
 const [productionExpanded, setProductionExpanded] = useState(productionActive);
 const [qualityExpanded, setQualityExpanded] = useState(qualityActive);
 const [scrapWastageExpanded, setScrapWastageExpanded] = useState(scrapWastageActive);
 const [salesExpanded, setSalesExpanded] = useState(salesActive);
 const [dispatchExpanded, setDispatchExpanded] = useState(dispatchActive);
 const [financeExpanded, setFinanceExpanded] = useState(financeActive);
 const [accountsExpanded, setAccountsExpanded] = useState(accountsActive);
 const [hrExpanded, setHrExpanded] = useState(hrActive);
 const canAccess = userRole.toLowerCase() === 'admin';

 const isVisible = (item?: SidebarItem) => {
 if (!item) return false;
 const ownVisible = !item.href || canViewPath(item.href.split('?')[0], userRole, permissions);
 if (!item.subItems) return ownVisible;
 return ownVisible || item.subItems.some((child) => child.subItems?.length
 ? child.subItems.some((nested) => canViewPath(nested.href.split('?')[0], userRole, permissions))
 : canViewPath(child.href.split('?')[0], userRole, permissions));
 };

 const hasVisibleItems = (section: SidebarSection) => section.items.some(isVisible);

 const visibleChildren = (item: SidebarItem) => ({
 ...item,
 subItems: item.subItems?.filter((child) => {
 if (child.href === '/production/assembly') {
 const isManagerOrAdmin = ['admin', 'system_admin', 'super_admin', 'production_manager', 'store_manager'].includes(userRole);
 if (!isManagerOrAdmin && !isAssemblyUser) {
 return false;
 }
 }
 return child.subItems?.length
 ? child.subItems.some((nested) => canViewPath(nested.href.split('?')[0], userRole, permissions))
 : canViewPath(child.href.split('?')[0], userRole, permissions);
 })
 .map((child) => {
 if (isAssemblyUser && child.href === '/production/assembly') {
 return { ...child, badge: 'Station' };
 }
 return child.subItems?.length
 ? { ...child, subItems: child.subItems.filter((nested) => canViewPath(nested.href.split('?')[0], userRole, permissions)) }
 : child;
 }),
 });

 useEffect(() => {
 if (goodReceivingActive) setGoodReceivingExpanded(true);
 }, [goodReceivingActive]);

 useEffect(() => {
 if (productsActive) setProductsExpanded(true);
 if (inventoryActive) setInventoryExpanded(true);
 if (productionActive) setProductionExpanded(true);
 if (qualityActive) setQualityExpanded(true);
 if (scrapWastageActive) setScrapWastageExpanded(true);
 if (salesActive) setSalesExpanded(true);
 if (dispatchActive) setDispatchExpanded(true);
 if (financeActive) setFinanceExpanded(true);
 if (accountsActive) setAccountsExpanded(true);
 if (intelligenceActive) setIntelligenceExpanded(true);
 }, [productsActive, inventoryActive, productionActive, qualityActive, scrapWastageActive, salesActive, dispatchActive, financeActive, accountsActive, intelligenceActive]);

 return (
 <>
 {/* Mobile Backdrop Overlay */}
 {isMobileOpen && (
 <div
 className="fixed inset-0 z-40 bg-[color:var(--overlay)] backdrop-blur-xs transition-opacity lg:hidden"
 onClick={onMobileClose}
 aria-hidden="true"
 />
 )}

 {/* Main Sidebar Element */}
 <aside
 className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-border/90 bg-white text-ink font-bold shadow-[4px_0_24px_rgba(15,23,42,0.04)] transition-all duration-300 ease-in-out ${
 /* Mobile positioning */
 isMobileOpen
 ? 'translate-x-0 w-72'
 : '-translate-x-full lg:translate-x-0'
 } ${
 /* Desktop width */
 isCollapsed ? 'lg:w-20' : 'lg:w-64'
 }`}
 >
 {/* Header Branding Area */}
 <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
 <Link
 href="/"
 onClick={onMobileClose}
 className={`flex items-center transition-opacity hover:opacity-90 w-full ${
 isCollapsed ? 'justify-center' : 'justify-start'
 }`}
 >
 {isCollapsed ? <PlinthMark className="h-8 w-8" /> : <Logo className="text-2xl" />}
 </Link>

 {/* Close button on mobile */}
 <button
 type="button"
 onClick={onMobileClose}
 aria-label="Close menu"
 className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden ml-auto shrink-0"
 >
 <X size={18} />
 </button>
 </div>

 {/* Navigation Content Area */}
 <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-3 no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
 {/* Section 1: Main Platform */}
 <div className={!hasVisibleItems(primarySection) ? 'hidden' : undefined}>
 {!isCollapsed && hasVisibleItems(primarySection) && (
 <p className="px-3 mb-2 text-xs font-black uppercase tracking-wider text-ink-secondary">
 {primarySection.title}
 </p>
 )}
 <div className="space-y-1">
 {isVisible(primarySection.items[0]) && (
 <NavItem
 item={primarySection.items[0]}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={false}
 onExpand={() => { }}
 onNavigate={onMobileClose}
 />
 )}
 {isVisible(primarySection.items[1]) && (
 <NavItem
 item={visibleChildren(primarySection.items[1])}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={intelligenceExpanded}
 onExpand={() => setIntelligenceExpanded((prev) => !prev)}
 onNavigate={onMobileClose}
 />
 )}
 {isVisible(primarySection.items[2]) && (
 <NavItem
 item={primarySection.items[2]}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={false}
 onExpand={() => { }}
 onNavigate={onMobileClose}
 />
 )}
 {isVisible(primarySection.items[3]) && (
 <NavItem
 item={visibleChildren(primarySection.items[3])}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={productsExpanded}
 onExpand={() => setProductsExpanded((prev) => !prev)}
 onNavigate={onMobileClose}
 />
 )}
 </div>
 </div>

 {/* Section 2: Supply Chain */}
 <div className={!hasVisibleItems(supplyChainSection) ? 'hidden' : undefined}>
 <div className="space-y-1">
 {supplyChainSection.items.map((item) => isVisible(item) && (
 <NavItem
 key={item.id}
 item={visibleChildren(item)}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={item.id === 'good-receiving' ? goodReceivingExpanded : false}
 onExpand={() => {
 if (item.id === 'good-receiving') {
 setGoodReceivingExpanded((prev) => !prev);
 }
 }}
 onNavigate={onMobileClose}
 />
 ))}
 </div>
 </div>

 {/* Section 3: Plant & Operations */}
 <div className={!hasVisibleItems(operationsSection) ? 'hidden' : undefined}>
 {!isCollapsed && hasVisibleItems(operationsSection) && (
 <p className="px-3 mb-2 text-xs font-black uppercase tracking-wider text-ink-secondary ">
 {operationsSection.title}
 </p>
 )}
 <div className="space-y-1">
 {isVisible(operationsSection.items[0]) && (
 <NavItem
 item={visibleChildren(operationsSection.items[0])}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={inventoryExpanded}
 onExpand={() => setInventoryExpanded((prev) => !prev)}
 onNavigate={onMobileClose}
 />
 )}
 {isVisible(operationsSection.items[1]) && (
 <NavItem
 item={visibleChildren(operationsSection.items[1])}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={productionExpanded}
 onExpand={() => setProductionExpanded((prev) => !prev)}
 onNavigate={onMobileClose}
 />
 )}
 {isVisible(operationsSection.items[2]) && (
 <NavItem
 item={visibleChildren(operationsSection.items[2])}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={qualityExpanded}
 onExpand={() => setQualityExpanded((prev) => !prev)}
 onNavigate={onMobileClose}
 />
 )}
 {isVisible(operationsSection.items[3]) && (
 <NavItem
 item={visibleChildren(operationsSection.items[3])}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={scrapWastageExpanded}
 onExpand={() => setScrapWastageExpanded((prev) => !prev)}
 onNavigate={onMobileClose}
 />
 )}
 {isVisible(operationsSection.items[4]) && (
 <NavItem
 item={visibleChildren(operationsSection.items[4])}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={salesExpanded}
 onExpand={() => setSalesExpanded((prev) => !prev)}
 onNavigate={onMobileClose}
 />
 )}
 {isVisible(operationsSection.items[5]) && (
 <NavItem
 item={visibleChildren(operationsSection.items[5])}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={dispatchExpanded}
 onExpand={() => setDispatchExpanded((prev) => !prev)}
 onNavigate={onMobileClose}
 />
 )}
 </div>
 </div>

 {/* Section 4: Finance & Accounts */}
 <div className={!hasVisibleItems(financeSection) ? 'hidden' : undefined}>
 {!isCollapsed && hasVisibleItems(financeSection) && (
 <p className="px-3 mb-2 text-xs font-black uppercase tracking-wider text-ink-secondary ">
 {financeSection.title}
 </p>
 )}
 <div className="space-y-1">
 {financeSection.items.map((item) =>
 isVisible(item) ? (
 <NavItem
 key={item.id}
 item={visibleChildren(item)}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={item.id === 'finance' ? financeExpanded : item.id === 'accounts' ? accountsExpanded : false}
 onExpand={() => {
 if (item.id === 'finance') setFinanceExpanded((prev) => !prev);
 if (item.id === 'accounts') setAccountsExpanded((prev) => !prev);
 }}
 onNavigate={onMobileClose}
 />
 ) : null
 )}
 </div>
 </div>

 {/* Section 5: Human Resources */}
 <div className={!hasVisibleItems(hrSection) ? 'hidden' : undefined}>
 {!isCollapsed && hasVisibleItems(hrSection) && (
 <p className="px-3 mb-2 text-xs font-black uppercase tracking-wider text-ink-secondary ">
 {hrSection.title}
 </p>
 )}
 <div className="space-y-1">
 {hrSection.items.map((item) =>
 isVisible(item) ? (
 <NavItem
 key={item.id}
 item={visibleChildren(item)}
 collapsed={isCollapsed}
 pathname={pathname}
 expanded={item.id === 'hr' ? hrExpanded : false}
 onExpand={() => {
 if (item.id === 'hr') setHrExpanded((prev) => !prev);
 }}
 onNavigate={onMobileClose}
 />
 ) : null
 )}
 </div>
 </div>
 </nav>

 {/* Footer Navigation */}
 <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-3 space-y-1">
 <div className="space-y-1">
 {/* Notifications Shortcut */}
 <Link
 href="/notifications"
 onClick={onMobileClose}
 title={isCollapsed ? 'Notifications' : undefined}
 className={`group relative flex w-full items-center transition-all ${isCollapsed
 ? 'h-10 w-10 mx-auto justify-center rounded-xl'
 : 'justify-between rounded-xl px-3 py-2'
 } ${pathname.startsWith('/notifications')
 ? 'bg-surface-muted text-ink font-black border-l-4 border-l-border-strong shadow-none'
 : 'text-ink font-extrabold hover:bg-muted hover:text-black '
 }`}
 >
 <div className="flex items-center gap-2.5">
 <div className="relative text-ink ">
 <Bell size={18} strokeWidth={2.2} />
 {unreadCount > 0 && (
 <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-action font-black text-white px-1">
 {unreadCount > 9 ? '9+' : unreadCount}
 </span>
 )}
 </div>
 {!isCollapsed && <span className="text-[14px] font-extrabold text-inherit">Notifications</span>}
 </div>

 {!isCollapsed && unreadCount > 0 && (
 <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-black text-ink">
 {unreadCount}
 </span>
 )}
 </Link>

 {/* Admin Access Shortcut */}
 {canAccess && (
 <Link
 href="/access"
 onClick={onMobileClose}
 title={isCollapsed ? 'User Access' : undefined}
 className={`group flex w-full items-center transition-all ${isCollapsed
 ? 'h-10 w-10 mx-auto justify-center rounded-xl'
 : 'gap-2.5 rounded-xl px-3 py-2'
 } ${pathname.startsWith('/access')
 ? 'bg-surface-muted text-ink font-black border-l-4 border-l-border-strong shadow-none'
 : 'text-ink font-extrabold hover:bg-muted hover:text-black '
 } text-[14px] font-extrabold `}
 >
 <div className="text-ink ">
 <ShieldCheck size={18} strokeWidth={2.2} />
 </div>
 {!isCollapsed && <span className="text-inherit">User Access & Roles</span>}
 </Link>
 )}

 {/* Collapse Control — theme toggle hidden: Plinth ships light-only */}
 <div className="flex items-center gap-1 pt-1">

 {/* Desktop Collapse Button */}
 {onToggle && (
 <button
 type="button"
 onClick={onToggle}
 title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
 className={`hidden lg:flex items-center justify-center rounded-xl border border-border-strong text-ink font-bold hover:bg-muted hover:text-black transition-colors ${isCollapsed ? 'h-10 w-10 mx-auto mt-1' : 'h-8 px-2.5 gap-1.5 text-xs font-extrabold '
 }`}
 >
 {isCollapsed ? <PanelLeftOpen size={15} strokeWidth={2.2} /> : <PanelLeftClose size={15} strokeWidth={2.2} />}
 {!isCollapsed && <span>Collapse</span>}
 </button>
 )}
 </div>
 </div>
 </div>
 </aside>
 </>
 );
}
