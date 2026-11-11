"use client";

import React, { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Settings, LogOut, ChevronDown, User, Menu } from "lucide-react"
import { Sidebar } from "./Sidebar"
import { NotificationCenter } from "./NotificationCenter"
import Link from "next/link"
import { Logo } from "../config/brand"
import { BootSplash } from "./brand/BootSplash"
import { authApi } from "../features/auth/api"
import { useCurrentUser } from "../features/auth/hooks"
import { canViewPath, getFirstAccessibleRoute, normalizeRole } from "../features/auth/access-control"
import { AskBusinessWidget } from "../features/intelligence/components/AskBusinessWidget"
export function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { data: currentUser, isLoading, isError } = useCurrentUser()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const effectiveRole = currentUser?.roleDefinition?.key || currentUser?.roles?.[0]?.key || currentUser?.role || 'employee'
  const effectivePermissions = currentUser?.permissions ?? []
  const canView = currentUser ? canViewPath(pathname, normalizeRole(effectiveRole), effectivePermissions) : true

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("#profile-menu-container")) {
        setIsProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    // Light-only ships (Addendum #3): the dark theme is removed. Existing
    // stored preferences are ignored; `dark:` classes resolve to light tokens.
    document.documentElement.classList.remove("dark");
  }, [])

  
  useEffect(() => {
    if (isError) {
      const next = pathname + (typeof window !== 'undefined' && window.location.search ? window.location.search : '');
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [isError, pathname, router])
  // If user is logged in but hasn't completed onboarding or needs password generation, enforce onboarding isolation
  const roleKey = normalizeRole(effectiveRole);
  const isStaffRole = roleKey !== 'admin' && roleKey !== 'system_admin' && roleKey !== 'subadmin' && roleKey !== 'sub_admin';
  const isAssemblyUser = Boolean(
    currentUser?.isAssemblyDepartment ||
    currentUser?.assignedDepartment?.isAssembly ||
    /assembly/i.test(currentUser?.department || '') ||
    /assembly/i.test(currentUser?.assignedDepartment?.name || '') ||
    /assembly/i.test(currentUser?.assignedDepartment?.code || '')
  );
  const needsOnboarding = currentUser && (
    Boolean(currentUser.mustChangePassword) ||
    (isStaffRole && !currentUser.onboardingCompleted)
  );
  useEffect(() => {
    if (!isLoading && needsOnboarding && pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
  }, [isLoading, needsOnboarding, pathname, router]);

  useEffect(() => {
    if (!isLoading && currentUser && !canView && !needsOnboarding) {
      const defaultLanding = ['department_incharge', 'department_head', 'dept_head'].includes(normalizeRole(effectiveRole))
        ? (isAssemblyUser ? '/production/assembly' : '/production/execution')
        : getFirstAccessibleRoute(effectiveRole, effectivePermissions, isAssemblyUser);
      const destination = pathname === '/' ? defaultLanding : (canViewPath('/', effectiveRole, effectivePermissions) ? '/' : defaultLanding);
      if (destination !== pathname) router.replace(destination);
    }
  }, [canView, currentUser, effectivePermissions, effectiveRole, isAssemblyUser, isLoading, needsOnboarding, pathname, router]);

  // Isolated full-screen render: only when the user IS authenticated.
  // If currentUser is null (unauthenticated), fall through so the isLoading/isError
  // branches below handle the redirect to /login correctly.
  if (currentUser && (needsOnboarding || pathname === '/onboarding')) {
    return (
      <div className="min-h-screen bg-background text-foreground w-full overflow-y-auto">
        {children}
      </div>
    );
  }

  if (isLoading || !currentUser) return <BootSplash />

  // RBAC is authoritative for workspace capabilities. The legacy enum remains
  // only as a fallback for older accounts that have not been assigned a role.
  const roleMap: Record<string, string> = {
    admin: "Admin",
    subadmin: "Sub-Admin",
    manager: "Store Manager",
    department_head: "Department Head",
    department_incharge: "Department Head",
    "department-incharge": "Department Head",
    shop_floor_operator: "Shop Floor Operator",
    "shop-floor-operator": "Shop Floor Operator",
    employee: "Operations Staff",
    accountant: "Accountant"
  }
  const formattedRole =
    currentUser.title ||
    currentUser.roleDefinition?.name ||
    roleMap[effectiveRole.toLowerCase()] ||
    effectiveRole.split(/[-_]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  return (
    <div className="min-h-screen bg-background text-foreground flex transition-colors duration-200 w-full overflow-hidden">
      {/* Responsive Sidebar Navigation */}
      <Sidebar
        userRole={effectiveRole}
        permissions={effectivePermissions}
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileNavOpen}
        onMobileClose={() => setIsMobileNavOpen(false)}
        isAssemblyUser={isAssemblyUser}
      />

      {/* Main Content Workspace */}
      <main className={`min-w-0 min-h-0 flex-1 transition-all duration-300 h-screen flex flex-col overflow-hidden pl-0 ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        {/* Top Header Navbar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30 transition-colors duration-200 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Drawer Trigger */}
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Menu size={18} />
            </button>

            {/* Mobile Brand Emblem */}
            <div className="lg:hidden flex items-center">
              <Logo className="text-lg" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Notification Center Popover */}
            <NotificationCenter />

            {/* Profile Dropdown */}
            <div id="profile-menu-container" className="relative border-l border-border pl-4">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 hover:bg-accent/50 p-1.5 rounded-md transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/15">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="hidden lg:block text-left mr-1">
                  <p className="text-[11px] font-medium text-foreground leading-none">{currentUser.name || "User"}</p>
                  <span className="text-[10px] text-muted-foreground font-medium mt-0.5 block">{formattedRole}</span>
                </div>
                <ChevronDown className="w-3 h-3 text-muted-foreground hidden lg:block" />
              </button>

              {/* Dropdown Menu */}
              {isProfileOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-md border border-border bg-popover shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2 border-b border-border mb-1 block lg:hidden">
                    <p className="text-xs font-medium text-foreground">{currentUser.name || "User"}</p>
                    <p className="text-[10px] text-muted-foreground">{formattedRole}</p>
                  </div>

                  <Link
                    href="/profile"
                    onClick={() => setIsProfileOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <User className="w-4 h-4" />
                    <span>My Profile</span>
                  </Link>

                  <Link
                    href="/settings"
                    onClick={() => setIsProfileOpen(false)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <Settings className="w-4 h-4" />
                    <span>System Settings</span>
                  </Link>

                  <div className="h-px bg-border my-1" />

                  <button
                    onClick={async () => {
                      try {
                        await authApi.logout()
                      } finally {
                        window.location.href = "/login"
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dashboard Main Workspace Layout */}
        <div className="flex-1 min-h-0 overflow-y-auto w-full relative">
          {canView ? children : null}
        </div>

        {/* Global Floating AI Business Advisor Widget */}
        <AskBusinessWidget />
      </main>
    </div>
  )
}
