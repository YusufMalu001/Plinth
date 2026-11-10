'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  Clock3,
  Info,
  X,
  AlertTriangle,
  FileCheck2,
  Package,
  Plus,
  ArrowRight,
  Search,
  Layers,
  ShoppingBag,
  Sparkles,
  Truck,
  Factory,
  ShieldCheck,
  Trash2,
  Landmark,
  Users,
  ChevronRight,
  LayoutGrid,
  PackageCheck,
} from 'lucide-react';
import { useNotifications, NotificationCategory } from '../../../components/NotificationCenter';
import {
  NOTIFICATION_MODULE_REGISTRY,
  NotificationModuleId,
} from '../../../features/notifications/notification-modules';
import { PageHeader, Button, Card } from '@synergy/ui';

const MODULE_ICON_MAP: Record<string, React.ElementType> = {
  ShoppingCart: ShoppingBag,
  PackageCheck: PackageCheck,
  Package: Package,
  Factory: Factory,
  ShieldCheck: ShieldCheck,
  Trash2: Trash2,
  Flame: Trash2,
  TrendingUp: ShoppingBag,
  Truck: Truck,
  Landmark: Landmark,
  Users: Users,
  Sparkles: Sparkles,
};

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead, remove } = useNotifications();
  const [activeModule, setActiveModule] = useState<NotificationModuleId>('all');
  const [activeTab, setActiveTab] = useState<NotificationCategory | 'unread'>('all');
  const [search, setSearch] = useState('');

  // Group modules by higher-level Section
  const sections = useMemo(() => {
    const grouped: Record<string, typeof NOTIFICATION_MODULE_REGISTRY> = {};
    NOTIFICATION_MODULE_REGISTRY.forEach((mod) => {
      if (!grouped[mod.section]) grouped[mod.section] = [];
      grouped[mod.section].push(mod);
    });
    return grouped;
  }, []);

  // Per-module total and unread counts
  const moduleCounts = useMemo(() => {
    const counts: Record<string, { total: number; unread: number }> = {};
    NOTIFICATION_MODULE_REGISTRY.forEach((m) => {
      counts[m.id] = { total: 0, unread: 0 };
    });

    notifications.forEach((n) => {
      const modId = n.moduleId || 'procurement';
      if (!counts[modId]) {
        counts[modId] = { total: 0, unread: 0 };
      }
      counts[modId].total += 1;
      if (!n.read) {
        counts[modId].unread += 1;
      }
    });

    return counts;
  }, [notifications]);

  // Section total and unread counts
  const sectionCounts = useMemo(() => {
    const counts: Record<string, { total: number; unread: number }> = {};
    Object.entries(sections).forEach(([sec, mods]) => {
      let total = 0;
      let unread = 0;
      mods.forEach((m) => {
        total += moduleCounts[m.id]?.total || 0;
        unread += moduleCounts[m.id]?.unread || 0;
      });
      counts[sec] = { total, unread };
    });
    return counts;
  }, [sections, moduleCounts]);

  // Global Metrics
  const totalCount = notifications.length;
  const stockAlertsCount = notifications.filter((n) => n.category === 'inventory').length;
  const approvalsCount = notifications.filter((n) => n.category === 'approvals').length;

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // Module filter
      if (activeModule !== 'all' && n.moduleId !== activeModule) return false;

      // Category / unread filter
      if (activeTab === 'unread' && n.read) return false;
      if (activeTab !== 'all' && activeTab !== 'unread' && n.category !== activeTab) return false;

      // Text search
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        n.moduleLabel.toLowerCase().includes(q) ||
        n.section.toLowerCase().includes(q)
      );
    });
  }, [notifications, activeModule, activeTab, search]);

  const selectedModuleMeta = NOTIFICATION_MODULE_REGISTRY.find((m) => m.id === activeModule);
  const activeModuleUnread = activeModule === 'all' ? unreadCount : (moduleCounts[activeModule]?.unread || 0);
  const activeModuleTotal = activeModule === 'all' ? totalCount : (moduleCounts[activeModule]?.total || 0);

  const markActiveModuleRead = () => {
    const targetIds = filteredNotifications.filter((n) => !n.read).map((n) => n.id);
    targetIds.forEach((id) => markRead(id));
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-muted/20 min-h-[calc(100vh-64px)]">
      <div className="w-full space-y-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <PageHeader
          title="Notifications & Workflow Inbox"
          description="Module-centric operational command center. Select any ERP module or section to inspect workflows, pending approvals, and alerts."
          actions={
            <div className="flex items-center gap-2.5">
              {unreadCount > 0 && (
                <Button
                  onClick={markAllRead}
                  variant="outline"
                  size="sm"
                  className="rounded-full shadow-xs font-semibold text-xs h-9"
                >
                  <CheckCheck size={14} className="mr-1.5" />
                  <span>Mark all as read</span>
                </Button>
              )}

              <Link href="/procurement/purchase-orders/generate">
                <Button
                  variant="default"
                  size="sm"
                  className="rounded-full shadow-xs bg-primary hover:bg-[#003c68] text-primary-foreground font-semibold text-xs h-9"
                >
                  <Plus size={14} className="mr-1.5" />
                  <span>Create Purchase Order</span>
                </Button>
              </Link>
            </div>
          }
        />

        {/* Executive Metrics Ribbon */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            onClick={() => {
              setActiveModule('all');
              setActiveTab('all');
            }}
            className={`rounded-xl border p-4 shadow-xs cursor-pointer transition-all ${
              activeModule === 'all' && activeTab === 'all'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border/70 bg-card hover:border-primary/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Updates
              </p>
              <div className="rounded-lg bg-muted p-1.5 text-muted-foreground">
                <Layers size={15} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{totalCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Across all modules</p>
          </div>

          <div
            onClick={() => {
              setActiveTab(activeTab === 'inventory' ? 'all' : 'inventory');
            }}
            className={`rounded-xl border p-4 shadow-xs cursor-pointer transition-all ${
              activeTab === 'inventory'
                ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 ring-2 ring-amber-400/20'
                : 'border-border/70 bg-card hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                Stock Alerts
              </p>
              <div className="rounded-lg bg-amber-500/10 p-1.5 text-amber-600">
                <AlertTriangle size={15} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600">{stockAlertsCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Reorder threshold reached</p>
          </div>

          <div
            onClick={() => {
              setActiveTab(activeTab === 'approvals' ? 'all' : 'approvals');
            }}
            className={`rounded-xl border p-4 shadow-xs cursor-pointer transition-all ${
              activeTab === 'approvals'
                ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/20 ring-2 ring-blue-400/20'
                : 'border-border/70 bg-card hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                Approvals
              </p>
              <div className="rounded-lg bg-blue-500/10 p-1.5 text-blue-600">
                <FileCheck2 size={15} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-blue-600">{approvalsCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Requisitions & orders</p>
          </div>

          <div
            onClick={() => {
              setActiveTab(activeTab === 'unread' ? 'all' : 'unread');
            }}
            className={`rounded-xl border p-4 shadow-xs cursor-pointer transition-all ${
              activeTab === 'unread'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'border-border/70 bg-card hover:border-primary/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">
                Unread Items
              </p>
              <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                <Bell size={15} />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{unreadCount}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Require your attention</p>
          </div>
        </div>

        {/* Main 2-Column Responsive Layout: Left Module Sidebar + Right Notification Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: ERP Modules & Sections (Module Hub) */}
          <aside className="lg:col-span-4 xl:col-span-4 space-y-4">
            <Card className="rounded-2xl border border-border/80 p-4 shadow-xs bg-card">
              <div className="flex items-center justify-between pb-3 border-b border-border/70">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <LayoutGrid size={15} />
                  </div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    ERP Modules
                  </h2>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  {unreadCount} remaining
                </span>
              </div>

              {/* All Modules option */}
              <div className="pt-3 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveModule('all')}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeModule === 'all'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-foreground hover:bg-muted/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Layers size={16} />
                    <span>All Modules</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {unreadCount > 0 && (
                      <span
                        className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                          activeModule === 'all'
                            ? 'bg-white text-primary'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {unreadCount}
                      </span>
                    )}
                    <span
                      className={`text-[11px] ${
                        activeModule === 'all' ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      }`}
                    >
                      {totalCount}
                    </span>
                  </div>
                </button>
              </div>

              {/* Sections & Individual Modules */}
              <div className="space-y-4 mt-1 divide-y divide-border/50">
                {Object.entries(sections).map(([sectionTitle, mods]) => {
                  const secStat = sectionCounts[sectionTitle] || { total: 0, unread: 0 };

                  return (
                    <div key={sectionTitle} className="pt-3 first:pt-0">
                      {/* Section Title with section badge on right-most end */}
                      <div className="flex items-center justify-between px-2 mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {sectionTitle}
                        </span>
                        {secStat.unread > 0 && (
                          <span className="rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                            {secStat.unread} unread
                          </span>
                        )}
                      </div>

                      {/* Module links under section */}
                      <div className="space-y-1">
                        {mods.map((mod) => {
                          const IconComponent = MODULE_ICON_MAP[mod.iconName] || Info;
                          const modStat = moduleCounts[mod.id] || { total: 0, unread: 0 };
                          const isSelected = activeModule === mod.id;

                          return (
                            <button
                              key={mod.id}
                              type="button"
                              onClick={() => setActiveModule(mod.id)}
                              className={`group w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                                isSelected
                                  ? 'bg-[#004a80] text-white shadow-xs font-bold'
                                  : 'text-foreground hover:bg-muted/60'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`p-1 rounded-lg shrink-0 ${
                                    isSelected
                                      ? 'text-white'
                                      : 'text-muted-foreground group-hover:text-foreground'
                                  }`}
                                >
                                  <IconComponent size={15} />
                                </div>
                                <span className="truncate">{mod.label}</span>
                              </div>

                              {/* Right most end: notification counts */}
                              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                {modStat.unread > 0 && (
                                  <span
                                    className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${
                                      isSelected
                                        ? 'bg-white text-[#004a80]'
                                        : 'bg-primary text-white shadow-2xs'
                                    }`}
                                    title={`${modStat.unread} remaining to view`}
                                  >
                                    {modStat.unread}
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] ${
                                    isSelected ? 'text-white/80' : 'text-muted-foreground'
                                  }`}
                                >
                                  {modStat.total}
                                </span>
                                <ChevronRight
                                  size={12}
                                  className={`transition-transform ${
                                    isSelected ? 'text-white translate-x-0.5' : 'text-muted-foreground/50'
                                  }`}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </aside>

          {/* Right Column: Search Toolbar, Filter Pills & Notification Stream */}
          <div className="lg:col-span-8 xl:col-span-8 space-y-4">
            {/* Active Module Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-border/80 bg-card shadow-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    {selectedModuleMeta ? selectedModuleMeta.section : 'Cross-Platform'}
                  </span>
                  <span className="text-muted-foreground text-xs">•</span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {activeModuleTotal} update{activeModuleTotal === 1 ? '' : 's'} (
                    {activeModuleUnread} unread)
                  </span>
                </div>
                <h2 className="text-base font-bold text-foreground mt-0.5">
                  {selectedModuleMeta ? selectedModuleMeta.label : 'All ERP Notifications'}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedModuleMeta
                    ? selectedModuleMeta.description
                    : 'Showing real-time stream of events, warnings, tasks, and sign-offs across all modules.'}
                </p>
              </div>

              {activeModuleUnread > 0 && (
                <Button
                  onClick={markActiveModuleRead}
                  variant="outline"
                  size="sm"
                  className="rounded-full shrink-0 text-xs h-8 font-semibold shadow-2xs self-start sm:self-auto"
                >
                  <CheckCheck size={13} className="mr-1" />
                  <span>Mark {selectedModuleMeta ? selectedModuleMeta.label : 'these'} read</span>
                </Button>
              )}
            </div>

            {/* Search & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:max-w-sm">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search notifications…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs bg-card border border-border/70 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground transition-all hover:bg-muted/40 placeholder:text-muted-foreground/70"
                />
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all shrink-0 ${
                    activeTab === 'all'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'border border-border/70 bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('inventory')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all shrink-0 flex items-center gap-1 ${
                    activeTab === 'inventory'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'border border-border/70 bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <AlertTriangle size={12} />
                  <span>Stock Alerts</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('approvals')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all shrink-0 flex items-center gap-1 ${
                    activeTab === 'approvals'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'border border-border/70 bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileCheck2 size={12} />
                  <span>Approvals</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('receipts')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all shrink-0 flex items-center gap-1 ${
                    activeTab === 'receipts'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'border border-border/70 bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Package size={12} />
                  <span>Receipts</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('unread')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all shrink-0 flex items-center gap-1 ${
                    activeTab === 'unread'
                      ? 'bg-foreground text-background shadow-xs'
                      : 'border border-border/70 bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span>Unread ({unreadCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('intelligence')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all shrink-0 flex items-center gap-1 ${
                    activeTab === 'intelligence'
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'border border-border/70 bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles size={12} />
                  <span>Advisor</span>
                </button>
              </div>
            </div>

            {/* Notifications Stream */}
            <Card className="shadow-xs overflow-hidden p-0 border border-border/80">
              {!filteredNotifications.length ? (
                <div className="px-6 py-20 text-center bg-card">
                  <div className="w-14 h-14 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-border/80 text-muted-foreground">
                    <Bell size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">You’re all caught up</h3>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                    No notifications matching{' '}
                    {selectedModuleMeta ? `the "${selectedModuleMeta.label}" module` : 'your filter criteria'}.
                    New workflow events and alerts will appear here as they occur.
                  </p>
                  {activeModule !== 'all' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModule('all');
                        setActiveTab('all');
                      }}
                      className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                      <span>View all modules</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border/60 bg-card">
                  {filteredNotifications.map((notification) => {
                    const isStockAlert = notification.category === 'inventory';

                    return (
                      <article
                        key={notification.id}
                        className={`relative flex items-start gap-4 p-5 sm:p-6 transition-colors hover:bg-muted/30 group ${
                          !notification.read ? 'bg-primary/[0.03]' : ''
                        }`}
                      >
                        {/* Unread dot */}
                        {!notification.read && (
                          <span className="absolute left-2.5 top-7 h-2 w-2 rounded-full bg-primary" />
                        )}

                        {/* Category Icon Badge */}
                        <div
                          className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center border ${
                            isStockAlert
                              ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                              : notification.type === 'sales'
                                ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20'
                                : notification.type === 'approval'
                                ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                : notification.type === 'receipt'
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                  : 'bg-primary/10 text-primary border-primary/20'
                          }`}
                        >
                          {isStockAlert ? (
                            <AlertTriangle size={18} />
                          ) : notification.type === 'sales' ? (
                            <ShoppingBag size={18} />
                          ) : notification.type === 'approval' ? (
                            <FileCheck2 size={18} />
                          ) : notification.type === 'receipt' ? (
                            <Package size={18} />
                          ) : notification.category === 'intelligence' ? (
                            <Sparkles size={18} />
                          ) : (
                            <Info size={18} />
                          )}
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Module & Section Badge */}
                              <span className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                                {notification.moduleLabel}
                              </span>

                              <span
                                className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  isStockAlert
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                    : notification.type === 'sales'
                                      ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20'
                                      : notification.type === 'approval'
                                        ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
                                        : notification.type === 'receipt'
                                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                                          : notification.category === 'intelligence'
                                            ? 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-500/20'
                                          : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {isStockAlert
                                  ? 'Inventory Alert'
                                  : notification.type === 'sales'
                                    ? 'Sales Order'
                                    : notification.type === 'approval'
                                      ? 'Approval Required'
                                      : notification.type === 'receipt'
                                        ? 'Goods Receipt'
                                        : notification.category === 'intelligence'
                                          ? 'Advisor Update'
                                        : 'System'}
                              </span>

                              <h2 className="text-sm font-bold text-foreground">
                                {notification.title}
                              </h2>
                            </div>

                            {/* Dismiss */}
                            <button
                              type="button"
                              aria-label="Dismiss notification"
                              onClick={() => remove(notification.id)}
                              className="rounded-lg p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                            {notification.message}
                          </p>

                          {/* Action Bar */}
                          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              {notification.href && (
                                <Link
                                  href={notification.href}
                                  onClick={() => markRead(notification.id)}
                                >
                                  <Button
                                    variant="default"
                                    size="sm"
                                    className={`rounded-xl shadow-xs font-semibold text-xs h-8 px-3.5 ${
                                      isStockAlert
                                        ? 'bg-primary hover:bg-[#003c68] text-primary-foreground'
                                        : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                                    }`}
                                  >
                                    {isStockAlert ? <Plus size={13} className="mr-1" /> : null}
                                    <span>{notification.actionLabel || 'Inspect Details'}</span>
                                    <ArrowRight size={13} className="ml-1" />
                                  </Button>
                                </Link>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Clock3 size={12} />
                                {new Date(notification.createdAt).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </span>

                              {!notification.read && (
                                <button
                                  type="button"
                                  onClick={() => markRead(notification.id)}
                                  className="text-xs font-semibold text-primary hover:underline"
                                >
                                  Mark as read
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
