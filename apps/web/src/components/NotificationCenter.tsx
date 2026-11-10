'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  ExternalLink,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useProcurementNotifications,
} from '../features/purchases/hooks';
import { useCurrentUser } from '../features/auth/hooks';
import { useRecommendations } from '../features/intelligence/hooks';
import { impactValue, percent } from '../features/intelligence/components/format';
import { showToast } from './toast-store';
import {
  classifyNotificationModule,
  NotificationModuleId,
} from '../features/notifications/notification-modules';

export type NotificationCategory = 'all' | 'inventory' | 'approvals' | 'receipts' | 'intelligence';

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'approval' | 'receipt' | 'sales' | 'intelligence';
  category: NotificationCategory;
  moduleId: Exclude<NotificationModuleId, 'all'>;
  moduleLabel: string;
  section: string;
  createdAt: string;
  read: boolean;
  href?: string;
  actionLabel?: string;
};

const PROACTIVE_INVENTORY_ALERTS: AppNotification[] = [
  {
    id: 'inv-thresh-1',
    title: 'Low Stock Alert: CRCA Sheet 1.2mm',
    message: 'Current stock is 45 sheets. Reorder threshold is 100 sheets. Supplier lead time is 4 days.',
    type: 'warning',
    category: 'inventory',
    moduleId: 'inventory',
    moduleLabel: 'Warehouse & Stock',
    section: 'Plant & Operations',
    createdAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    read: false,
    actionLabel: 'Raise PO',
    href: '/procurement/purchase-orders/generate?material=MAT-CRCA-1.2',
  },
  {
    id: 'inv-thresh-2',
    title: 'Predicted Stockout: SS304 Square Tube 25x25',
    message: 'Expected to reach zero in 48 hours based on active production schedule for Batch #892.',
    type: 'warning',
    category: 'inventory',
    moduleId: 'inventory',
    moduleLabel: 'Warehouse & Stock',
    section: 'Plant & Operations',
    createdAt: new Date(Date.now() - 1000 * 60 * 135).toISOString(),
    read: false,
    actionLabel: 'View Item',
    href: '/inventory',
  },
];

const LOCAL_STORAGE_READ_NOTIFICATIONS_KEY = 'synergy:notifications:read_ids';
const LOCAL_STORAGE_DISMISSED_NOTIFICATIONS_KEY = 'synergy:notifications:dismissed_ids';

type LocalNotificationState = {
  readIds: string[];
  dismissedIds: string[];
};

let memoryState: LocalNotificationState = {
  readIds: [],
  dismissedIds: [],
};

let stateInitialized = false;
const stateListeners = new Set<(state: LocalNotificationState) => void>();

function loadSavedLocalState(): LocalNotificationState {
  if (typeof window === 'undefined') {
    return memoryState;
  }
  try {
    const savedRead = localStorage.getItem(LOCAL_STORAGE_READ_NOTIFICATIONS_KEY);
    const savedDismissed = localStorage.getItem(LOCAL_STORAGE_DISMISSED_NOTIFICATIONS_KEY);
    return {
      readIds: savedRead ? (JSON.parse(savedRead) as string[]) : [],
      dismissedIds: savedDismissed ? (JSON.parse(savedDismissed) as string[]) : [],
    };
  } catch {
    return memoryState;
  }
}

function saveLocalState(next: LocalNotificationState) {
  memoryState = next;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCAL_STORAGE_READ_NOTIFICATIONS_KEY, JSON.stringify(next.readIds));
      localStorage.setItem(LOCAL_STORAGE_DISMISSED_NOTIFICATIONS_KEY, JSON.stringify(next.dismissedIds));
    } catch {
      // Ignore localStorage errors
    }
  }
  stateListeners.forEach((listener) => listener(next));
}

function getLocalNotificationState(): LocalNotificationState {
  if (!stateInitialized && typeof window !== 'undefined') {
    memoryState = loadSavedLocalState();
    stateInitialized = true;
  }
  return memoryState;
}

export function resetNotificationStateForTests() {
  stateInitialized = false;
  memoryState = {
    readIds: [],
    dismissedIds: [],
  };
  stateListeners.clear();
}

export function useNotifications() {
  const query = useProcurementNotifications();
  const { data: currentUser } = useCurrentUser();
  const canAccessIntelligence = useMemo(() => {
    if (!currentUser) return false;
    const roleKey = String(currentUser.roleDefinition?.key || currentUser.role || '').toLowerCase();
    if (['admin', 'system_admin', 'super_admin', 'executive', 'plant_manager', 'operations_manager'].includes(roleKey)) return true;
    return (currentUser.permissions || []).some((p: string) => /intelligence/i.test(p));
  }, [currentUser]);

  const recsQuery = useRecommendations(
    { status: 'OPEN', limit: 20 },
    { enabled: canAccessIntelligence, meta: { silentError: true }, retry: false }
  );
  const markOne = useMarkNotificationRead();
  const markEvery = useMarkAllNotificationsRead();

  const [localState, setLocalState] = useState<LocalNotificationState>(getLocalNotificationState);

  useEffect(() => {
    setLocalState(getLocalNotificationState());
    const listener = (next: LocalNotificationState) => setLocalState(next);
    stateListeners.add(listener);

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === LOCAL_STORAGE_READ_NOTIFICATIONS_KEY ||
        event.key === LOCAL_STORAGE_DISMISSED_NOTIFICATIONS_KEY
      ) {
        const refreshed = loadSavedLocalState();
        memoryState = refreshed;
        stateListeners.forEach((l) => l(refreshed));
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      stateListeners.delete(listener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const dismissedLocal = localState.dismissedIds;
  const readLocal = localState.readIds;

  const [readRecIds, setReadRecIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('synergy-read-rec-ids');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const saveReadRec = (recId: string) => {
    setReadRecIds((prev) => {
      const next = new Set(prev).add(recId);
      try {
        localStorage.setItem('synergy-read-rec-ids', JSON.stringify(Array.from(next)));
      } catch {
        /* ignore localStorage quota/disabled errors */
      }
      return next;
    });
  };

  const saveAllReadRecs = (recIds: string[]) => {
    setReadRecIds((prev) => {
      const next = new Set(prev);
      recIds.forEach((id) => next.add(id));
      try {
        localStorage.setItem('synergy-read-rec-ids', JSON.stringify(Array.from(next)));
      } catch {
        /* ignore localStorage quota/disabled errors */
      }
      return next;
    });
  };

  const notifications: AppNotification[] = useMemo(() => {
    const rawItems = query.data?.items ?? [];
    const existingRecIds = new Set(
      rawItems
        .filter((i) => i.resource === 'Recommendation' && i.resourceId)
        .map((i) => i.resourceId as string)
    );

    const apiNotifications: AppNotification[] = rawItems.map((item) => {
      let category: AppNotification['category'] = 'approvals';
      let type: AppNotification['type'] = 'info';

      const isSales = item.resource === 'SalesOrder' || item.title?.toLowerCase().includes('sales order') || item.title?.toLowerCase().includes('pos sale') || item.title?.toLowerCase().includes('amazon order');
      const isIntelligence = ['Recommendation', 'BusinessTask', 'IntelligenceCase', 'DailyInsight', 'IntelligenceRun'].includes(item.resource || '') || /advisor|hermes|recommendation|daily business review|daily brief|task overdue/i.test(item.title || '');

      if (isIntelligence) {
        type = ['HIGH', 'CRITICAL'].includes(item.priority || '') ? 'warning' : 'intelligence';
        category = 'intelligence';
      } else if (isSales) {
        type = 'sales';
        category = 'approvals';
      } else if (item.type === 'APPROVAL_REQUIRED') {
        type = 'approval';
        category = 'approvals';
      } else if (item.type === 'CHANGES_REQUESTED') {
        type = 'warning';
        category = 'approvals';
      } else if (item.title?.toLowerCase().includes('receipt') || item.message?.toLowerCase().includes('grn')) {
        type = 'receipt';
        category = 'receipts';
      } else if (item.resource === 'DepartmentExecutionBatch' || item.title?.toLowerCase().includes('production stage') || item.title?.toLowerCase().includes('stage assigned')) {
        type = 'info';
        category = 'approvals';
      }

      let actionLabel: string | undefined = undefined;
      if (item.type === 'APPROVAL_REQUIRED') {
        actionLabel = 'Review & Sign Off';
      } else if (
        item.href?.includes('/production/execution') ||
        item.title?.toLowerCase().includes('schedule released') ||
        item.message?.toLowerCase().includes('released to your department') ||
        item.resource === 'DepartmentExecutionBatch' ||
        item.title?.toLowerCase().includes('production stage') ||
        item.title?.toLowerCase().includes('stage assigned')
      ) {
        actionLabel = 'Open Workshop';
      }

      const href = item.href || (item.resource === 'SalesOrder' && item.resourceId ? `/sales/orders/${item.resourceId}` : item.resource === 'Recommendation' && item.resourceId ? `/decision-center/recommendations/${item.resourceId}` : item.resource === 'BusinessTask' && item.resourceId ? `/decision-center/tasks/${item.resourceId}` : undefined);
      const { moduleId, section, moduleLabel } = classifyNotificationModule({
        resource: item.resource,
        href,
        title: item.title,
        message: item.message,
        category,
      });

      return {
        id: item.id,
        title: item.title,
        message: item.message,
        type,
        category,
        moduleId,
        section,
        moduleLabel,
        createdAt: item.createdAt,
        read: Boolean(item.readAt) || readLocal.includes(item.id),
        href,
        actionLabel: isIntelligence ? 'Review Suggestion' : isSales
          ? 'View Sales Order'
          : actionLabel,
      };
    });

    // Merge in Hermes open recommendations
    const openRecs: AppNotification[] = (recsQuery.data?.items ?? [])
      .filter((rec) => !existingRecIds.has(rec.id))
      .map((rec) => {
        const moduleLabel = rec.module ? rec.module.charAt(0) + rec.module.slice(1).toLowerCase() : 'System';
        const impact = impactValue(rec.expectedImpact);
        const confidence = percent(rec.confidence);
        const isRead = readRecIds.has(rec.id);

        const { moduleId, section, moduleLabel: classifiedLabel } = classifyNotificationModule({
          resource: 'Recommendation',
          href: `/decision-center/recommendations/${rec.id}`,
          title: rec.title,
          message: `${moduleLabel} Suggestion • Expected base impact: ${impact} (${confidence} confidence)`,
          category: 'intelligence',
        });

        return {
          id: `rec-${rec.id}`,
          title: rec.title,
          message: `${moduleLabel} Suggestion • Expected base impact: ${impact} (${confidence} confidence)`,
          type: (['CRITICAL', 'HIGH'].includes(rec.priority) ? 'warning' : 'intelligence') as AppNotification['type'],
          category: 'intelligence' as NotificationCategory,
          moduleId,
          section,
          moduleLabel: classifiedLabel,
          createdAt: rec.createdAt || new Date().toISOString(),
          read: isRead,
          href: `/decision-center/recommendations/${rec.id}`,
          actionLabel: 'Review Suggestion',
        };
      });

    const activeLocalAlerts = PROACTIVE_INVENTORY_ALERTS.filter(
      (a) => !dismissedLocal.includes(a.id)
    ).map((a) => ({
      ...a,
      read: readLocal.includes(a.id),
    }));

    return [...activeLocalAlerts, ...apiNotifications, ...openRecs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [query.data?.items, recsQuery.data?.items, readRecIds, dismissedLocal, readLocal]);

  const markRead = (id: string) => {
    if (id.startsWith('rec-')) {
      saveReadRec(id.replace('rec-', ''));
    }
    const current = getLocalNotificationState();
    if (!current.readIds.includes(id)) {
      saveLocalState({
        ...current,
        readIds: [...current.readIds, id],
      });
    }
    if (!id.startsWith('inv-thresh') && !id.startsWith('rec-')) {
      markOne.mutate(id);
    }
  };

  const markAllRead = () => {
    const current = getLocalNotificationState();
    const allIds = notifications.map((n) => n.id);
    const combinedReadIds = Array.from(new Set([...current.readIds, ...allIds]));
    saveLocalState({
      ...current,
      readIds: combinedReadIds,
    });
    markEvery.mutate();
    const openRecIds = (recsQuery.data?.items ?? []).map((r) => r.id);
    saveAllReadRecs(openRecIds);
  };

  const remove = (id: string) => {
    if (id.startsWith('rec-')) {
      saveReadRec(id.replace('rec-', ''));
    }
    const current = getLocalNotificationState();
    if (!current.dismissedIds.includes(id)) {
      saveLocalState({
        ...current,
        dismissedIds: [...current.dismissedIds, id],
      });
    }
    if (!id.startsWith('inv-thresh') && !id.startsWith('rec-')) {
      markOne.mutate(id);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const refresh = async () => {
    await Promise.all([query.refetch(), recsQuery.refetch()]);
  };

  return {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    remove,
    isLoading: query.isLoading || recsQuery.isLoading,
    refresh,
  };
}

export function NotificationCenter({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationCategory>('all');
  const { notifications, unreadCount, markRead, markAllRead, remove, refresh, isLoading } = useNotifications();
  const seenNotificationIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (seenNotificationIds.current === null) {
      seenNotificationIds.current = new Set(notifications.map((item) => item.id));
      return;
    }
    const previous = seenNotificationIds.current;
    const fresh = notifications.filter((item) => !previous.has(item.id) && item.category === 'intelligence');
    notifications.forEach((item) => previous.add(item.id));
    fresh.slice(0, 3).forEach((item) => showToast({
      kind: 'hermes',
      title: item.title,
      message: item.message,
      badge: 'HERMES AI',
      duration: 8000,
      action: item.href ? { label: item.actionLabel || 'Review Suggestion', href: item.href } : undefined,
    }));
    if (fresh.length > 3) showToast({ kind: 'hermes', title: 'More Hermes updates', message: `${fresh.length - 3} additional items are in Notifications.`, badge: 'HERMES AI', action: { label: 'Open notifications', href: '/notifications' } });
  }, [notifications, isLoading]);

  // Filter notifications by active tab
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return notifications;
    return notifications.filter((n) => n.category === activeTab);
  }, [notifications, activeTab]);

  const inventoryAlertsCount = notifications.filter(
    (n) => n.category === 'inventory' && !n.read
  ).length;

  const approvalsCount = notifications.filter(
    (n) => n.category === 'approvals' && !n.read
  ).length;

  const receiptsCount = notifications.filter(
    (n) => n.category === 'receipts' && !n.read
  ).length;
  const intelligenceCount = notifications.filter(
    (n) => n.category === 'intelligence' && !n.read
  ).length;

  return (
    <div className="relative">
      {/* Bell Trigger Button */}
      <button
        type="button"
        aria-label="Open notifications"
        onClick={() => {
          void refresh();
          setOpen((prev) => !prev);
        }}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${open
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border/70 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
          }`}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-bold text-primary-foreground shadow-xs animate-in zoom-in-75">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Pop-up Panel */}
      {open && (
        <>
          {/* Backdrop click dismiss */}
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />

          <div
            className={`absolute z-[80] mt-2.5 w-[min(420px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border/80 bg-popover text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-150 ${compact ? 'left-0' : 'right-0'
              }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bell size={14} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Notifications
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    {unreadCount} unread update{unreadCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <CheckCheck size={13} />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 bg-muted/10 px-3 py-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all shrink-0 ${activeTab === 'all'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                All ({notifications.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('inventory')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all shrink-0 flex items-center gap-1 ${activeTab === 'inventory'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <span>Stock Alerts</span>
                {inventoryAlertsCount > 0 && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-white text-[8px] font-bold">
                    {inventoryAlertsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('approvals')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all shrink-0 flex items-center gap-1 ${activeTab === 'approvals'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <span>Approvals</span>
                {approvalsCount > 0 && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-white text-[8px] font-bold">
                    {approvalsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('receipts')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all shrink-0 flex items-center gap-1 ${activeTab === 'receipts'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <span>Receipts</span>
                {receiptsCount > 0 && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white text-[8px] font-bold">
                    {receiptsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('intelligence')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all shrink-0 flex items-center gap-1 ${activeTab === 'intelligence'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                <span>Advisor</span>
                {intelligenceCount > 0 && (
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-violet-600 text-white text-[8px] font-bold">
                    {intelligenceCount}
                  </span>
                )}
              </button>
            </div>

            {/* Notification Stream */}
            <div className="max-h-[380px] overflow-y-auto divide-y divide-border/60">
              {!filteredNotifications.length ? (
                <div className="py-10 px-4 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground mb-2">
                    <Sparkles size={18} />
                  </div>
                  <p className="text-xs font-semibold text-foreground">You’re all caught up</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    No active notifications in this category.
                  </p>
                </div>
              ) : (
                filteredNotifications.slice(0, 8).map((notification) => {
                  const isStockAlert = notification.category === 'inventory';

                  return (
                    <div
                      key={notification.id}
                      className={`group relative flex items-start gap-3 p-3.5 transition-colors hover:bg-muted/30 ${!notification.read ? 'bg-primary/[0.04]' : ''
                        }`}
                    >
                      {/* Unread indicator dot */}
                      {!notification.read && (
                        <span className="absolute top-4 left-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                      )}

                      {/* Icon */}
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${isStockAlert
                            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                            : notification.type === 'sales'
                              ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'
                              : notification.type === 'approval'
                                ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                            : notification.type === 'receipt'
                                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                                  : notification.category === 'intelligence'
                                    ? 'bg-violet-500/10 text-violet-600 border border-violet-500/20'
                                  : 'bg-primary/10 text-primary border border-primary/20'
                          }`}
                      >
                        {isStockAlert ? (
                          <AlertTriangle size={15} />
                        ) : notification.type === 'sales' ? (
                          <ShoppingBag size={15} />
                        ) : notification.type === 'approval' ? (
                          <FileCheck2 size={15} />
                        ) : notification.type === 'receipt' ? (
                          <Package size={15} />
                        ) : notification.category === 'intelligence' ? (
                          <Sparkles size={15} />
                        ) : (
                          <Info size={15} />
                        )}
                      </div>

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="rounded px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                                {notification.moduleLabel}
                              </span>
                            </div>
                            <p className="text-xs font-semibold text-foreground leading-snug">
                              {notification.title}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Dismiss notification"
                            onClick={() => remove(notification.id)}
                            className="rounded-md p-1 text-muted-foreground/50 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground transition-all"
                          >
                            <X size={12} />
                          </button>
                        </div>

                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          {notification.message}
                        </p>

                        {/* Direct Action (e.g. Raise PR or Review) */}
                        {notification.href && (
                          <div className="mt-2 flex items-center gap-2">
                            <Link
                              href={notification.href}
                              onClick={() => {
                                markRead(notification.id);
                                setOpen(false);
                              }}
                              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${
                                isStockAlert
                                  ? 'bg-primary text-primary-foreground hover:bg-[#003c68] shadow-2xs'
                                  : 'border border-border bg-card text-foreground hover:bg-muted'
                                }`}
                            >
                              {isStockAlert ? <Plus size={11} /> : <ExternalLink size={11} />}
                              <span>{notification.actionLabel || 'Inspect'}</span>
                            </Link>
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock3 size={10} />
                            {formatRelativeTime(notification.createdAt)}
                          </span>

                          {!notification.read && (
                            <button
                              type="button"
                              onClick={() => markRead(notification.id)}
                              className="font-semibold text-primary hover:underline"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 border-t border-border/70 bg-muted/20 px-4 py-2.5 text-center text-xs font-semibold text-primary hover:bg-muted/40 transition-colors"
            >
              <span>Open Workflow Inbox</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function formatRelativeTime(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
