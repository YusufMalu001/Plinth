import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotifications, resetNotificationStateForTests } from '../NotificationCenter';
// Mock TanStack React Query hooks
vi.mock('../../features/purchases/hooks', () => ({
  useProcurementNotifications: vi.fn(() => ({
    data: { items: [] },
    isLoading: false,
    refetch: vi.fn(),
  })),
  useMarkNotificationRead: vi.fn(() => ({
    mutate: vi.fn(),
  })),
  useMarkAllNotificationsRead: vi.fn(() => ({
    mutate: vi.fn(),
  })),
}));

vi.mock('../../features/intelligence/hooks', () => ({
  useRecommendations: vi.fn(() => ({
    data: { items: [] },
    isLoading: false,
    refetch: vi.fn(),
  })),
}));

vi.mock('../../features/auth/hooks', () => ({
  useCurrentUser: vi.fn(() => ({
    data: undefined,
    isLoading: false,
  })),
}));

describe('useNotifications', () => {
  beforeEach(() => {
    localStorage.clear();
    resetNotificationStateForTests();
  });

  it('initially includes unread mock inventory alerts and shares unread count across hooks', () => {
    const { result: hook1 } = renderHook(() => useNotifications());
    const { result: hook2 } = renderHook(() => useNotifications());

    expect(hook1.current.unreadCount).toBe(2);
    expect(hook2.current.unreadCount).toBe(2);

    // Mark all read on hook1
    act(() => {
      hook1.current.markAllRead();
    });

    // Both hooks should immediately synchronize to 0 unread
    expect(hook1.current.unreadCount).toBe(0);
    expect(hook2.current.unreadCount).toBe(0);
  });

  it('marks single notification as read and synchronizes across consumers', () => {
    const { result: hook1 } = renderHook(() => useNotifications());
    const { result: hook2 } = renderHook(() => useNotifications());

    expect(hook1.current.unreadCount).toBe(2);

    act(() => {
      hook1.current.markRead('inv-thresh-1');
    });

    expect(hook1.current.unreadCount).toBe(1);
    expect(hook2.current.unreadCount).toBe(1);
  });

  it('synchronizes unread count across multiple consumers when marking all notifications read', () => {
    const { result: sidebarHook } = renderHook(() => useNotifications());
    const { result: headerBellHook } = renderHook(() => useNotifications());
    const { result: inboxPageHook } = renderHook(() => useNotifications());

    expect(sidebarHook.current.unreadCount).toBe(2);
    expect(headerBellHook.current.unreadCount).toBe(2);
    expect(inboxPageHook.current.unreadCount).toBe(2);

    act(() => {
      inboxPageHook.current.markAllRead();
    });

    expect(sidebarHook.current.unreadCount).toBe(0);
    expect(headerBellHook.current.unreadCount).toBe(0);
    expect(inboxPageHook.current.unreadCount).toBe(0);
  });

  it('synchronizes unread count when storage events arrive from another tab', () => {
    const { result: hook } = renderHook(() => useNotifications());

    expect(hook.current.unreadCount).toBe(2);

    act(() => {
      // Simulate another browser tab marking an alert as read
      localStorage.setItem('plinth:notifications:read_ids', JSON.stringify(['inv-thresh-1']));
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'plinth:notifications:read_ids',
          newValue: JSON.stringify(['inv-thresh-1']),
        })
      );
    });

    expect(hook.current.unreadCount).toBe(1);

    act(() => {
      // Simulate another tab marking all read
      localStorage.setItem('plinth:notifications:read_ids', JSON.stringify(['inv-thresh-1', 'inv-thresh-2']));
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'plinth:notifications:read_ids',
          newValue: JSON.stringify(['inv-thresh-1', 'inv-thresh-2']),
        })
      );
    });

    expect(hook.current.unreadCount).toBe(0);
  });
});
