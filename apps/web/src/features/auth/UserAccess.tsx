"use client"

import React, { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { SafeUser } from "@plinth/types"
import { Badge, Button, Input } from "@plinth/ui"
import { authenticatedApiRequest } from "./api"
import { showToast } from "../../components/toast-store"
import {
 AlertTriangle,
 BarChart3,
 Barcode,
 BookOpen,
 Boxes,
 Box,
 Building,
 Building2,
 CalendarDays,
 Check,
 CheckCircle2,
 ClipboardList,
 Cpu,
 Eye,
 Factory,
 FileCheck,
 Filter,
 GitFork,
 LayoutDashboard,
 Lock,
 Package,
 PackageCheck,
 Pencil,
 Plus,
 Receipt,
 RefreshCw,
 RotateCcw,
 Save,
 Scale,
 Search,
 Settings,
 Shield,
 ShieldAlert,
 ShieldCheck,
 ShoppingBag,
 ShoppingCart,
 Sparkles,
 Store,
 UserCheck,
 UserPlus,
 Users,
 UserX,
 Wrench,
 X,
} from "lucide-react"

export type Permission = {
 id: string
 key: string
 action: string
 resource: string
 description: string | null
 assigned: boolean
}

export type Role = {
 id: string
 key: string
 name: string
 description?: string | null
 isSystem?: boolean
 isActive?: boolean
 permissions: Permission[]
 _count?: { users: number }
}

const pretty = (value: string) =>
 value
 .replace(/[-_]/g, " ")
 .replace(/\b\w/g, (char) => char.toUpperCase())

const RESOURCE_META: Record<
 string,
 { label: string; category: string; description: string; icon: React.ElementType }
> = {
 Dashboard: {
 label: "Dashboard & Metrics",
 category: "Core Platform",
 description: "Operational overview, KPI charts and executive widgets",
 icon: LayoutDashboard,
 },
 User: {
 label: "User Accounts",
 category: "System Administration",
 description: "Workspace user provisioning and team member access",
 icon: Users,
 },
 RolePermission: {
 label: "Roles & RBAC",
 category: "System Administration",
 description: "Role definitions and custom capability matrices",
 icon: ShieldCheck,
 },
 AuditLog: {
 label: "Audit Trails",
 category: "System Administration",
 description: "Immutable compliance logs and security event history",
 icon: FileCheck,
 },
 MasterData: {
 label: "Master Data",
 category: "Catalog & Master Data",
 description: "System categories, families, item codes and parameters",
 icon: Settings,
 },
 Product: {
 label: "Products Catalog",
 category: "Catalog & Master Data",
 description: "Finished goods, variants, pricing, SKUs and barcodes",
 icon: Box,
 },
 Material: {
 label: "Raw Materials",
 category: "Catalog & Master Data",
 description: "Production materials, suppliers and stock units",
 icon: Package,
 },
 UnitOfMeasure: {
 label: "Units of Measure",
 category: "Catalog & Master Data",
 description: "Measurement dimensions and conversion scales",
 icon: Scale,
 },
 Vendor: {
 label: "Vendor Directory",
 category: "Supply Chain",
 description: "Supplier profiles, contacts, bank details and history",
 icon: Building2,
 },
 PurchaseRequisition: {
 label: "Purchase Requisitions",
 category: "Supply Chain",
 description: "Internal material requisitions and approval chains",
 icon: ClipboardList,
 },
 PurchaseOrder: {
 label: "Purchase Orders",
 category: "Supply Chain",
 description: "Supplier purchase orders, revisions and dispatch",
 icon: ShoppingCart,
 },
 ExpectedReceipt: {
 label: "Expected Receipts",
 category: "Supply Chain",
 description: "Scheduled inbound vendor deliveries and queues",
 icon: CalendarDays,
 },
 GoodsReceiptNote: {
 label: "Goods Receiving (GRN)",
 category: "Supply Chain",
 description: "Physical intake verification, tag generation and posting",
 icon: PackageCheck,
 },
 GoodsReceiptLabel: {
 label: "GRN Labels & Barcodes",
 category: "Supply Chain",
 description: "Pallet barcodes, QR labels and reprint controls",
 icon: Barcode,
 },
 GoodsReceiptDiscrepancy: {
 label: "Receiving Discrepancies",
 category: "Supply Chain",
 description: "Damage flags, short deliveries and vendor returns",
 icon: AlertTriangle,
 },
 DebitNote: {
 label: "Debit Notes",
 category: "Supply Chain",
 description: "Financial deductions and supplier chargebacks",
 icon: Receipt,
 },
 VendorScorecard: {
 label: "Vendor Scorecards",
 category: "Supply Chain",
 description: "Supplier KPI tracking and reliability scoring",
 icon: BarChart3,
 },
 VendorEvaluation: {
 label: "Vendor Evaluations",
 category: "Supply Chain",
 description: "Periodic vendor performance and quality reviews",
 icon: FileCheck,
 },
 Inventory: {
 label: "Inventory & Stores",
 category: "Plant & Operations",
 description: "Stock balances, reservations and store transfers",
 icon: Boxes,
 },
 StockLedgerEntry: {
 label: "Stock Ledger",
 category: "Plant & Operations",
 description: "Immutable double-entry inventory movements",
 icon: BookOpen,
 },
 BomVersion: {
 label: "Bill of Materials (BOM)",
 category: "Plant & Operations",
 description: "Multi-level manufacturing recipes and versioning",
 icon: Cpu,
 },
 ProductionPlan: {
 label: "Production Planning",
 category: "Plant & Operations",
 description: "Manufacturing schedules, batch runs and releases",
 icon: Factory,
 },
 Production: {
 label: "Shop Floor Execution",
 category: "Plant & Operations",
 description: "Department station logs, output and scrap tracking",
 icon: Wrench,
 },
 ProductRoute: {
 label: "Product Routings",
 category: "Plant & Operations",
 description: "Station sequences and standard labor duration",
 icon: GitFork,
 },
 Department: {
 label: "Plant Departments",
 category: "Plant & Operations",
 description: "Production lines and departmental centers",
 icon: Building,
 },
 Report: {
 label: "Reports & Analytics",
 category: "Core Platform",
 description: "Executive analytics, inventory audits and financial exports",
 icon: BarChart3,
 },
 SalesOrder: {
 label: "Sales & Orders",
 category: "Commercial & Sales",
 description: "B2B and B2C sales orders, fulfillment, dispatch and invoicing",
 icon: ShoppingBag,
 },
 Customer: {
 label: "Customers & Dealers",
 category: "Commercial & Sales",
 description: "Customer accounts, dealer profiles, commercial credit terms and pricing tiers",
 icon: UserCheck,
 },
 SalesChannel: {
 label: "Sales Channels",
 category: "Commercial & Sales",
 description: "E-commerce integrations, dealer networks, store POS and direct channels",
 icon: Store,
 },
}

export function UserAccess() {
 const [users, setUsers] = useState<SafeUser[]>([])
 const [roles, setRoles] = useState<Role[]>([])
 const [loading, setLoading] = useState(true)
 const [tab, setTab] = useState<"users" | "roles">("users")
 const [userOpen, setUserOpen] = useState(false)
 const [roleOpen, setRoleOpen] = useState(false)
 const [selectedRoleId, setSelectedRoleId] = useState("")
 const [search, setSearch] = useState("")
 const [userSearch, setUserSearch] = useState("")
 const [userRoleFilter, setUserRoleFilter] = useState("ALL")
 const [userStatusFilter, setUserStatusFilter] = useState("ALL")
 const [categoryFilter, setCategoryFilter] = useState("ALL")
 const [error, setError] = useState<string | null>(null)
 const [dialogError, setDialogError] = useState<string | null>(null)
 const [userSubmitting, setUserSubmitting] = useState(false)
 const [roleSubmitting, setRoleSubmitting] = useState(false)

 // User creation form
 const [userForm, setUserForm] = useState({
 name: "",
 email: "",
 password: "",
 roleDefinitionId: "",
 })

 // Role creation form
 const [roleForm, setRoleForm] = useState({
 key: "",
 name: "",
 description: "",
 cloneFromRoleId: "",
 })

 // Draft permission IDs for the selected role in the matrix
 const [roleDraft, setRoleDraft] = useState<string[]>([])
 const [savingRole, setSavingRole] = useState(false)

 // Load initial workspace access data
 const load = useCallback(async () => {
 setLoading(true)
 setError(null)
 try {
 const result = await authenticatedApiRequest<{ users: SafeUser[]; roles: Role[] }>(
 "/access/bootstrap?page=1&limit=100"
 )
 const fetchedUsers = result.data?.users || []
 const fetchedRoles = result.data?.roles || []
 setUsers(fetchedUsers)
 setRoles(fetchedRoles)

 setSelectedRoleId((current) => {
 if (current && fetchedRoles.some((r) => r.id === current)) return current
 return fetchedRoles[0]?.id || ""
 })
 } catch (e) {
 setError(e instanceof Error ? e.message : "Unable to load access configurations")
 } finally {
 setLoading(false)
 }
 }, [])

 useEffect(() => {
 void load()
 }, [load])

 const currentRole = useMemo(
 () => roles.find((r) => r.id === selectedRoleId),
 [roles, selectedRoleId]
 )

 // Synchronize draft when selected role changes
 useEffect(() => {
 if (currentRole) {
 const assignedIds = currentRole.permissions
 .filter((p) => p.assigned)
 .map((p) => p.id)
 setRoleDraft(assignedIds)
 }
 }, [currentRole])

 // Compute all unique permissions catalog across the system
 const allPermissions = useMemo(() => {
 if (!roles.length) return []
 return currentRole?.permissions || roles[0]?.permissions || []
 }, [roles, currentRole])

 // Group permissions by resource with clean categorized buckets
 const resourceMatrix = useMemo(() => {
 const map = new Map<
 string,
 {
 resource: string
 label: string
 category: string
 description: string
 icon: React.ElementType
 view: Permission[]
 create: Permission[]
 update: Permission[]
 approve: Permission[]
 manage: Permission[]
 all: Permission[]
 }
 >()

 allPermissions.forEach((p) => {
 const res = p.resource
 if (!map.has(res)) {
 const meta = RESOURCE_META[res] || {
 label: pretty(res),
 category: "Other Services",
 description: `Manage ${pretty(res)} records`,
 icon: Shield,
 }
 map.set(res, {
 resource: res,
 label: meta.label,
 category: meta.category,
 description: meta.description,
 icon: meta.icon,
 view: [],
 create: [],
 update: [],
 approve: [],
 manage: [],
 all: [],
 })
 }

 const item = map.get(res)!
 item.all.push(p)

 const action = p.action.toLowerCase()
 if (action === "read" || action === "view") {
 item.view.push(p)
 } else if (action === "create" || action === "request" || action === "submit") {
 item.create.push(p)
 } else if (action === "update" || action === "revise" || action === "validate" || action === "request_changes") {
 item.update.push(p)
 } else if (action === "approve" || action === "self_approve" || action === "sign_off" || action === "finalize") {
 item.approve.push(p)
 } else {
 item.manage.push(p)
 }
 })

 return Array.from(map.values())
 }, [allPermissions])

 // Filtered matrix rows based on search and category filter
 const filteredMatrix = useMemo(() => {
 return resourceMatrix.filter((row) => {
 const matchesSearch =
 search === "" ||
 row.label.toLowerCase().includes(search.toLowerCase()) ||
 row.resource.toLowerCase().includes(search.toLowerCase()) ||
 row.description.toLowerCase().includes(search.toLowerCase()) ||
 row.all.some((p) => (p.description || "").toLowerCase().includes(search.toLowerCase()))

 const matchesCat = categoryFilter === "ALL" || row.category === categoryFilter
 return matchesSearch && matchesCat
 })
 }, [resourceMatrix, search, categoryFilter])

 // List of categories for tabs
 const categories = useMemo(() => {
 const set = new Set<string>()
 resourceMatrix.forEach((r) => set.add(r.category))
 return Array.from(set)
 }, [resourceMatrix])

 // Filtered users
 const filteredUsers = useMemo(() => {
 return users.filter((u) => {
 const matchesSearch =
 userSearch === "" ||
 (u.name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
 u.email.toLowerCase().includes(userSearch.toLowerCase())

 const matchesRole =
 userRoleFilter === "ALL" ||
 (userRoleFilter === "LEGACY" ? !u.roleDefinition : u.roleDefinition?.id === userRoleFilter)

 const matchesStatus =
 userStatusFilter === "ALL" ||
 (userStatusFilter === "ACTIVE" && u.isActive !== false) ||
 (userStatusFilter === "INACTIVE" && u.isActive === false)

 return matchesSearch && matchesRole && matchesStatus
 })
 }, [users, userSearch, userRoleFilter, userStatusFilter])

 const isSuperAdminRole =
 currentRole?.isSystem && currentRole?.name.toLowerCase() === "super-admin"
 const isDirty = useMemo(() => {
 if (!currentRole) return false
 const assignedOriginal = currentRole.permissions
 .filter((p) => p.assigned)
 .map((p) => p.id)
 .sort()
 const assignedDraft = [...roleDraft].sort()
 if (assignedOriginal.length !== assignedDraft.length) return true
 return assignedOriginal.some((id, idx) => id !== assignedDraft[idx])
 }, [currentRole, roleDraft])

 // Toggle single permission ID
 const togglePermission = (permissionId: string) => {
 if (isSuperAdminRole) return
 setRoleDraft((prev) =>
 prev.includes(permissionId)
 ? prev.filter((id) => id !== permissionId)
 : [...prev, permissionId]
 )
 }

 // Toggle all permissions for a specific module row
 const toggleRowPermissions = (permissions: Permission[], shouldGrant: boolean) => {
 if (isSuperAdminRole) return
 const ids = permissions.map((p) => p.id)
 setRoleDraft((prev) => {
 if (shouldGrant) {
 return Array.from(new Set([...prev, ...ids]))
 } else {
 return prev.filter((id) => !ids.includes(id))
 }
 })
 }

 // Grant or Clear all permissions for the active role
 const handleBulkRoleAction = (grantAll: boolean) => {
 if (isSuperAdminRole) return
 if (grantAll) {
 setRoleDraft(allPermissions.map((p) => p.id))
 } else {
 setRoleDraft([])
 }
 }

 // Save modified permissions for the selected role
 async function saveSelectedRole() {
 if (!currentRole || !isDirty || isSuperAdminRole) return
 setSavingRole(true)
 setError(null)
 try {
 await authenticatedApiRequest(`/roles/${currentRole.id}`, {
 method: "PATCH",
 body: JSON.stringify({ permissionIds: roleDraft }),
 })
 await load()
 showToast({
 kind: "success",
 title: "Role Permissions Updated",
 message: `Successfully saved ${roleDraft.length} capabilities for ${pretty(currentRole.name)}.`,
 })
 } catch (e) {
 setError(e instanceof Error ? e.message : "Failed to update role permissions")
 } finally {
 setSavingRole(false)
 }
 }

 // Create new user
 async function createUser(event: FormEvent) {
 event.preventDefault()
 setDialogError(null)
 setUserSubmitting(true)
 try {
 await authenticatedApiRequest("/users", {
 method: "POST",
 body: JSON.stringify({
 name: userForm.name.trim() || undefined,
 email: userForm.email.trim(),
 password: userForm.password,
 role: "employee",
 roleDefinitionId: userForm.roleDefinitionId || undefined,
 }),
 })
 setUserOpen(false)
 setUserForm({ email: "", name: "", password: "", roleDefinitionId: "" })
 await load()
 showToast({
 kind: "success",
 title: "User Created",
 message: "New workspace user has been registered successfully.",
 })
 } catch (e) {
 setDialogError(e instanceof Error ? e.message : "Failed to create user")
 } finally {
 setUserSubmitting(false)
 }
 }

 // Create new role
 async function createRole(event: FormEvent) {
 event.preventDefault()
 setDialogError(null)
 setRoleSubmitting(true)
 try {
 let initialPermissions: string[] = []
 if (roleForm.cloneFromRoleId) {
 const source = roles.find((r) => r.id === roleForm.cloneFromRoleId)
 if (source) {
 initialPermissions = source.permissions.filter((p) => p.assigned).map((p) => p.id)
 }
 }

 await authenticatedApiRequest("/roles", {
 method: "POST",
 body: JSON.stringify({
 key: roleForm.key.trim(),
 name: roleForm.name.trim(),
 description: roleForm.description.trim() || undefined,
 permissionIds: initialPermissions,
 }),
 })
 setRoleOpen(false)
 setRoleForm({ key: "", name: "", description: "", cloneFromRoleId: "" })
 await load()
 showToast({
 kind: "success",
 title: "Role Created",
 message: "New role definition created. You can now configure its matrix permissions.",
 })
 } catch (e) {
 setDialogError(e instanceof Error ? e.message : "Failed to create role")
 } finally {
 setRoleSubmitting(false)
 }
 }

 // Assign role to user
 async function assignUserRole(userId: string, roleDefinitionId: string) {
 setError(null)
 try {
 await authenticatedApiRequest(`/users/${userId}/role`, {
 method: "PATCH",
 body: JSON.stringify({ roleDefinitionId }),
 })
 await load()
 showToast({
 kind: "success",
 title: "Role Updated",
 message: "User role assignment and security capabilities were updated.",
 })
 } catch (e) {
 setError(e instanceof Error ? e.message : "Failed to assign role")
 }
 }

 // Toggle user active status
 async function toggleUserStatus(userId: string, currentActive: boolean) {
 setError(null)
 const newStatus = !currentActive
 try {
 await authenticatedApiRequest(`/users/${userId}/status`, {
 method: "PATCH",
 body: JSON.stringify({ isActive: newStatus }),
 })
 await load()
 showToast({
 kind: "success",
 title: newStatus ? "User Activated" : "User Deactivated",
 message: `Workspace access ${newStatus ? "enabled" : "disabled"}.`,
 })
 } catch (e) {
 setError(e instanceof Error ? e.message : "Failed to toggle user status")
 }
 }

 if (loading) {
 return (
 <div className="w-full space-y-6 animate-pulse">
 <div className="h-28 rounded-2xl bg-active " />
 <div className="h-96 rounded-2xl bg-active " />
 </div>
 )
 }

 const activeUsersCount = users.filter((u) => u.isActive !== false).length
 const totalPermissionsCount = allPermissions.length

 return (
 <div className="w-full space-y-6 font-manrope">
 {/* 1. Header Banner & Quick Stats */}
 <div className="relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-sm">
 <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
 <div className="space-y-1">
 <div className="flex items-center gap-3">
 <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)] ">
 <ShieldCheck size={24} strokeWidth={2.2} />
 </div>
 <div>
 <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink font-manrope">
 User Access & Security Control
 </h1>
 <p className="text-xs sm:text-sm font-semibold text-ink-secondary font-manrope">
 Provision workspace members, define custom roles, and fine-tune granular module capabilities.
 </p>
 </div>
 </div>
 </div>

 {/* Quick Action CTAs */}
 <div className="flex flex-wrap items-center gap-3">
 <Button
 onClick={() => {
 setDialogError(null)
 setUserOpen(true)
 }}
 className="bg-inverse hover:bg-[#2E2E2E] active:bg-[#000000] text-white font-black px-4 py-2 rounded-xl text-xs gap-2 shadow-xs transition-all cursor-pointer"
 >
 <UserPlus size={16} strokeWidth={2.5} />
 Add User
 </Button>
 <Button
 onClick={() => {
 setDialogError(null)
 setRoleOpen(true)
 }}
 variant="outline"
 className="border-border-strong text-ink font-bold px-4 py-2 rounded-xl text-xs gap-2 hover:bg-muted "
 >
 <Plus size={16} strokeWidth={2.5} />
 New Role
 </Button>
 </div>
 </div>

 {/* Metric Badges */}
 <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-border pt-5">
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tone-blue-bg/10 text-link ">
 <Users size={18} strokeWidth={2.2} />
 </div>
 <div>
 <p className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary ">
 Total Users
 </p>
 <p className="text-base font-black text-ink ">
 {users.length} <span className="text-xs font-semibold text-ink-secondary">({activeUsersCount} active)</span>
 </p>
 </div>
 </div>

 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tone-purple-bg/10 text-tone-purple-text ">
 <Shield size={18} strokeWidth={2.2} />
 </div>
 <div>
 <p className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary ">
 Defined Roles
 </p>
 <p className="text-base font-black text-ink ">{roles.length} Roles</p>
 </div>
 </div>

 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-tone-emerald-bg/10 text-tone-green-text ">
 <CheckCircle2 size={18} strokeWidth={2.2} />
 </div>
 <div>
 <p className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary ">
 Capabilities
 </p>
 <p className="text-base font-black text-ink ">
 {totalPermissionsCount} Catalog Grants
 </p>
 </div>
 </div>

 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] ">
 <Sparkles size={18} strokeWidth={2.2} />
 </div>
 <div>
 <p className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary ">
 RBAC Security
 </p>
 <p className="text-base font-black text-tone-green-text ">Active & Enforced</p>
 </div>
 </div>
 </div>
 </div>

 {/* Global Error Banner */}
 {error && (
 <div className="flex items-center justify-between rounded-xl border border-tone-red-solid bg-tone-red-bg p-4 text-xs font-bold text-tone-red-text ">
 <div className="flex items-center gap-2">
 <ShieldAlert size={16} className="shrink-0" />
 <span>{error}</span>
 </div>
 <button type="button" onClick={() => setError(null)} className="hover:opacity-80">
 <X size={15} />
 </button>
 </div>
 )}

 {/* 2. Top Navigation Tabs */}
 <div className="flex items-center justify-between border-b border-border pb-2">
 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={() => setTab("users")}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
 tab === "users"
 ? "bg-action text-inverse shadow-xs"
 : "text-ink-secondary hover:bg-active/60 "
 }`}
 >
 <Users size={16} strokeWidth={2.4} />
 <span>Workspace Users</span>
 <span
 className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
 tab === "users" ? "bg-white/20 text-white" : "bg-active text-ink-secondary "
 }`}
 >
 {users.length}
 </span>
 </button>

 <button
 type="button"
 onClick={() => setTab("roles")}
 className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
 tab === "roles"
 ? "bg-action text-inverse shadow-xs"
 : "text-ink-secondary hover:bg-active/60 "
 }`}
 >
 <ShieldCheck size={16} strokeWidth={2.4} />
 <span>Roles & Permission Matrix</span>
 <span
 className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
 tab === "roles" ? "bg-white/20 text-white" : "bg-active text-ink-secondary "
 }`}
 >
 {roles.length}
 </span>
 </button>
 </div>

 <Button
 variant="ghost"
 size="sm"
 onClick={() => void load()}
 className="text-xs font-bold text-ink-secondary gap-1.5 hover:bg-muted "
 >
 <RefreshCw size={13} />
 Refresh
 </Button>
 </div>

 {/* 3. SECTION 1: USERS DIRECTORY */}
 {tab === "users" && (
 <div className="space-y-4">
 {/* User Filters Toolbar */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-white p-4 shadow-xs">
 <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
 <div className="relative flex-1 sm:max-w-md">
 <Search size={15} className="absolute left-3 top-3 text-ink-muted" />
 <Input
 placeholder="Search by user name or email address..."
 value={userSearch}
 onChange={(e) => setUserSearch(e.target.value)}
 className="pl-9 h-10 text-xs font-bold rounded-xl border-border "
 />
 </div>

 {/* Role filter */}
 <div className="flex items-center gap-2">
 <Filter size={14} className="text-ink-muted shrink-0" />
 <select
 value={userRoleFilter}
 onChange={(e) => setUserRoleFilter(e.target.value)}
 className="h-10 rounded-xl border border-border bg-white px-3 text-xs font-bold text-ink outline-none"
 >
 <option value="ALL">All Roles ({users.length})</option>
 {roles.map((r) => (
 <option key={r.id} value={r.id}>
 {pretty(r.name)}
 </option>
 ))}
 <option value="LEGACY">Legacy Direct Roles</option>
 </select>
 </div>

 {/* Status filter */}
 <select
 value={userStatusFilter}
 onChange={(e) => setUserStatusFilter(e.target.value)}
 className="h-10 rounded-xl border border-border bg-white px-3 text-xs font-bold text-ink outline-none"
 >
 <option value="ALL">All Statuses</option>
 <option value="ACTIVE">Active Users Only</option>
 <option value="INACTIVE">Inactive Users Only</option>
 </select>
 </div>

 <div className="text-xs font-bold text-ink-secondary ">
 Showing <strong className="text-ink ">{filteredUsers.length}</strong> of{" "}
 {users.length} members
 </div>
 </div>

 {/* Full Width Users Table */}
 <div className="w-full overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs font-manrope border-collapse">
 <thead>
 <tr className="border-b border-border bg-muted/80 text-[11px] font-black uppercase tracking-wider text-ink-secondary ">
 <th className="py-3.5 px-6 min-w-[280px]">User Profile</th>
 <th className="py-3.5 px-6 min-w-[220px]">Assigned Role</th>
 <th className="py-3.5 px-6 min-w-[180px]">Effective Grants</th>
 <th className="py-3.5 px-6 min-w-[130px]">Status</th>
 <th className="py-3.5 px-6 text-right min-w-[120px]">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border ">
 {filteredUsers.map((user) => {
 const assignedRoleDef = roles.find((r) => r.id === user.roleDefinition?.id)
 const grantCount = assignedRoleDef
 ? assignedRoleDef.permissions.filter((p) => p.assigned).length
 : user.role === "admin"
 ? totalPermissionsCount
 : 12

 // Generate avatar initials
 const initials = (user.name || user.email)
 .split(" ")
 .map((n) => n[0])
 .slice(0, 2)
 .join("")
 .toUpperCase()

 return (
 <tr
 key={user.id}
 className="hover:bg-muted/60 transition-colors"
 >
 {/* 1. User Profile */}
 <td className="py-4 px-6">
 <div className="flex items-center gap-3">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-inverse text-white font-black text-xs shadow-2xs">
 {initials}
 </div>
 <div className="min-w-0">
 <p className="font-extrabold text-[13px] text-ink truncate">
 {user.name || "Unnamed Team Member"}
 </p>
 <p className="text-[11px] font-medium text-ink-secondary truncate">
 {user.email}
 </p>
 </div>
 </div>
 </td>

 {/* 2. Assigned Role Dropdown */}
 <td className="py-4 px-6">
 <div className="relative inline-block w-full max-w-[210px]">
 <select
 aria-label={`Role for ${user.email}`}
 value={user.roleDefinition?.id || ""}
 onChange={(e) => void assignUserRole(user.id, e.target.value)}
 className="w-full h-9 rounded-xl border border-border bg-muted px-3 pr-8 text-xs font-bold text-ink outline-none focus:border-[var(--accent-blue)] focus:ring-1 focus:ring-[var(--accent-blue)]"
 >
 <option value="" disabled>
 Legacy: {pretty(user.role)}
 </option>
 {roles
 .filter((r) => r.isActive !== false)
 .map((r) => (
 <option key={r.id} value={r.id}>
 {pretty(r.name)} {r.isSystem ? "(System)" : ""}
 </option>
 ))}
 </select>
 </div>
 </td>

 {/* 3. Effective Grants */}
 <td className="py-4 px-6">
 <div className="space-y-1">
 <div className="flex items-center justify-between text-[11px] font-bold text-ink-secondary ">
 <span>{grantCount} Capabilities</span>
 <span className="text-[10px] text-ink-muted">
 {Math.round((grantCount / (totalPermissionsCount || 1)) * 100)}%
 </span>
 </div>
 <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
 <div
 className="h-full bg-[var(--accent-blue)] rounded-full transition-all"
 style={{
 width: `${Math.min(100, Math.round((grantCount / (totalPermissionsCount || 1)) * 100))}%`,
 }}
 />
 </div>
 </div>
 </td>

 {/* 4. Active Status Toggle */}
 <td className="py-4 px-6">
 <button
 type="button"
 onClick={() => void toggleUserStatus(user.id, user.isActive !== false)}
 className="inline-flex items-center gap-1.5 focus:outline-none"
 >
 <span
 className={`flex h-6 items-center rounded-full px-2.5 text-[10px] font-black uppercase tracking-wider transition-all ${
 user.isActive !== false
 ? "bg-tone-emerald-bg text-tone-green-text border border-tone-green-solid "
 : "bg-muted text-ink-secondary border border-border-strong "
 }`}
 >
 <span
 className={`h-1.5 w-1.5 rounded-full mr-1.5 ${
 user.isActive !== false ? "bg-tone-emerald-bg" : "bg-active"
 }`}
 />
 {user.isActive !== false ? "Active" : "Inactive"}
 </span>
 </button>
 </td>

 {/* 5. Actions */}
 <td className="py-4 px-6 text-right">
 <Button
 variant="ghost"
 size="sm"
 onClick={() => void toggleUserStatus(user.id, user.isActive !== false)}
 className="text-xs font-bold text-ink-secondary hover:text-ink "
 >
 {user.isActive !== false ? (
 <UserX size={15} className="text-tone-red-text mr-1" />
 ) : (
 <UserCheck size={15} className="text-tone-green-text mr-1" />
 )}
 {user.isActive !== false ? "Deactivate" : "Activate"}
 </Button>
 </td>
 </tr>
 )
 })}
 </tbody>
 </table>

 {filteredUsers.length === 0 && (
 <div className="py-16 text-center">
 <Users size={36} className="mx-auto text-ink-placeholder mb-2" />
 <p className="text-sm font-extrabold text-ink ">
 No workspace users found
 </p>
 <p className="text-xs text-ink-secondary mt-1">
 Try adjusting your search criteria or add a new user.
 </p>
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {/* 4. SECTION 2: ROLES & PERMISSION MATRIX (CLEAN, CONSISTENT MATRIX VIEW) */}
 {tab === "roles" && (
 <div className="space-y-6">
 {/* Role Selector Header Bar */}
 <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
 <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
 <div>
 <p className="text-[11px] font-black uppercase tracking-wider text-ink-secondary ">
 Select Role to Configure
 </p>
 <div className="flex flex-wrap items-center gap-2 mt-2">
 {roles.map((r) => {
 const isSelected = selectedRoleId === r.id
 const assignedCount = isSelected
 ? roleDraft.length
 : r.permissions.filter((p) => p.assigned).length

 return (
 <button
 key={r.id}
 type="button"
 onClick={() => setSelectedRoleId(r.id)}
 className={`group relative flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-extrabold transition-all select-none ${
 isSelected
 ? "bg-[var(--accent-blue)] text-white shadow-md scale-[1.02]"
 : "bg-muted text-ink-secondary hover:bg-active "
 }`}
 >
 {r.isSystem && <Lock size={12} className="opacity-70" />}
 <span>{pretty(r.name)}</span>
 <span
 className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
 isSelected
 ? "bg-white/20 text-white"
 : "bg-active text-ink-secondary "
 }`}
 >
 {assignedCount}/{totalPermissionsCount}
 </span>
 <span className="text-[10px] opacity-60">({r._count?.users || 0} users)</span>
 </button>
 )
 })}
 </div>
 </div>

 {/* Action Controls & Save Bar */}
 <div className="flex flex-wrap items-center gap-3">
 {isDirty && !isSuperAdminRole && (
 <Button
 variant="outline"
 size="sm"
 onClick={() => {
 if (currentRole) {
 setRoleDraft(
 currentRole.permissions.filter((p) => p.assigned).map((p) => p.id)
 )
 }
 }}
 className="text-xs font-bold border-border-strong text-ink-secondary hover:bg-muted gap-1.5"
 >
 <RotateCcw size={14} />
 Discard Changes
 </Button>
 )}

 <Button
 onClick={() => void saveSelectedRole()}
 disabled={!isDirty || savingRole || isSuperAdminRole}
 className={`px-5 py-2 rounded-xl text-xs font-black gap-2 transition-all ${
 isDirty
 ? "bg-inverse hover:bg-[#2E2E2E] active:bg-[#000000] text-white shadow-md animate-pulse"
 : "bg-active text-ink-muted cursor-not-allowed"
 }`}
 >
 <Save size={15} strokeWidth={2.5} />
 {savingRole ? "Saving Capabilities..." : "Save Role Permissions"}
 </Button>
 </div>
 </div>

 {/* Role Summary Banner */}
 {currentRole && (
 <div className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl bg-muted p-3.5 border border-border/80 text-xs gap-3">
 <div className="flex items-center gap-3">
 <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] ">
 <Shield size={16} />
 </div>
 <div>
 <div className="flex items-center gap-2">
 <span className="font-extrabold text-ink ">
 {pretty(currentRole.name)}
 </span>
 {currentRole.isSystem && (
 <Badge variant="outline" className="text-[10px] font-black border-[var(--accent-blue)]/30 text-[var(--accent-blue)] ">
 System Role
 </Badge>
 )}
 </div>
 <p className="text-[11px] text-ink-secondary ">
 {currentRole.description || "Custom operational role with configurable capabilities."}
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <Button
 variant="outline"
 size="sm"
 disabled={isSuperAdminRole}
 onClick={() => handleBulkRoleAction(true)}
 className="h-8 text-[11px] font-bold border-border-strong "
 >
 Grant All
 </Button>
 <Button
 variant="outline"
 size="sm"
 disabled={isSuperAdminRole}
 onClick={() => handleBulkRoleAction(false)}
 className="h-8 text-[11px] font-bold border-border-strong text-tone-red-text "
 >
 Clear All
 </Button>
 </div>
 </div>
 )}
 </div>

 {/* Search & Category Filter */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex flex-wrap items-center gap-2">
 <button
 type="button"
 onClick={() => setCategoryFilter("ALL")}
 className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
 categoryFilter === "ALL"
 ? "bg-[var(--accent-blue)] text-white"
 : "bg-white border border-border text-ink-secondary hover:bg-muted"
 }`}
 >
 All Modules ({resourceMatrix.length})
 </button>
 {categories.map((cat) => (
 <button
 key={cat}
 type="button"
 onClick={() => setCategoryFilter(cat)}
 className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors ${
 categoryFilter === cat
 ? "bg-[var(--accent-blue)] text-white"
 : "bg-white border border-border text-ink-secondary hover:bg-muted"
 }`}
 >
 {cat}
 </button>
 ))}
 </div>

 <div className="relative w-full sm:w-72">
 <Search size={14} className="absolute left-3 top-2.5 text-ink-muted" />
 <Input
 placeholder="Search capability or resource..."
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 className="pl-9 h-9 text-xs font-bold rounded-xl border-border "
 />
 </div>
 </div>

 {/* Clean, Consistent Matrix Table */}
 <div className="w-full overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs font-manrope border-collapse">
 <thead>
 <tr className="border-b border-border bg-muted/90 text-[11px] font-black uppercase tracking-wider text-ink-secondary ">
 <th className="py-4 px-6 min-w-[280px]">Module / Service</th>
 <th className="py-4 px-3 text-center min-w-[130px]">
 <div className="flex items-center justify-center gap-1.5">
 <Eye size={13} className="text-tone-blue-text" />
 <span>View / Read</span>
 </div>
 </th>
 <th className="py-4 px-3 text-center min-w-[130px]">
 <div className="flex items-center justify-center gap-1.5">
 <Plus size={13} className="text-tone-purple-text" />
 <span>Create / Req</span>
 </div>
 </th>
 <th className="py-4 px-3 text-center min-w-[130px]">
 <div className="flex items-center justify-center gap-1.5">
 <Pencil size={13} className="text-tone-green-text" />
 <span>Edit / Revise</span>
 </div>
 </th>
 <th className="py-4 px-3 text-center min-w-[140px]">
 <div className="flex items-center justify-center gap-1.5">
 <CheckCircle2 size={13} className="text-[var(--accent-blue)] " />
 <span>Approve / Sign</span>
 </div>
 </th>
 <th className="py-4 px-3 text-center min-w-[150px]">
 <div className="flex items-center justify-center gap-1.5">
 <Settings size={13} className="text-tone-red-text" />
 <span>Manage / Operations</span>
 </div>
 </th>
 <th className="py-4 px-6 text-right min-w-[120px]">Row Control</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-border ">
 {filteredMatrix.map((row) => {
 const rowAssignedCount = row.all.filter((p) => roleDraft.includes(p.id)).length
 const allRowGranted = rowAssignedCount === row.all.length && row.all.length > 0
 const someRowGranted = rowAssignedCount > 0 && !allRowGranted
 const IconComponent = row.icon

 return (
 <tr
 key={row.resource}
 className="hover:bg-muted/80 transition-colors"
 >
 {/* 1. Module Info */}
 <td className="py-4 px-6">
 <div className="flex items-center gap-3">
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-ink ">
 <IconComponent size={18} strokeWidth={2.2} />
 </div>
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-black text-[13px] text-ink truncate">
 {row.label}
 </span>
 <span
 className={`rounded-full px-2 py-0.2 text-[9px] font-black uppercase tracking-wider ${
 allRowGranted
 ? "bg-tone-emerald-bg text-tone-green-text "
 : someRowGranted
 ? "bg-tone-blue-bg text-tone-blue-text "
 : "bg-muted text-ink-secondary "
 }`}
 >
 {rowAssignedCount}/{row.all.length}
 </span>
 </div>
 <p className="text-[11px] font-medium text-ink-secondary truncate mt-0.5">
 {row.description}
 </p>
 </div>
 </div>
 </td>

 {/* 2. View Bucket */}
 <td className="py-4 px-3 text-center">
 <CleanMatrixCell
 permissions={row.view}
 draft={roleDraft}
 disabled={isSuperAdminRole}
 onToggle={togglePermission}
 />
 </td>

 {/* 3. Create Bucket */}
 <td className="py-4 px-3 text-center">
 <CleanMatrixCell
 permissions={row.create}
 draft={roleDraft}
 disabled={isSuperAdminRole}
 onToggle={togglePermission}
 />
 </td>

 {/* 4. Edit Bucket */}
 <td className="py-4 px-3 text-center">
 <CleanMatrixCell
 permissions={row.update}
 draft={roleDraft}
 disabled={isSuperAdminRole}
 onToggle={togglePermission}
 />
 </td>

 {/* 5. Approve Bucket */}
 <td className="py-4 px-3 text-center">
 <CleanMatrixCell
 permissions={row.approve}
 draft={roleDraft}
 disabled={isSuperAdminRole}
 onToggle={togglePermission}
 />
 </td>

 {/* 6. Manage Bucket */}
 <td className="py-4 px-3 text-center">
 <CleanMatrixCell
 permissions={row.manage}
 draft={roleDraft}
 disabled={isSuperAdminRole}
 onToggle={togglePermission}
 />
 </td>

 {/* 7. Row Actions */}
 <td className="py-4 px-6 text-right">
 <button
 type="button"
 disabled={isSuperAdminRole}
 onClick={() => toggleRowPermissions(row.all, !allRowGranted)}
 className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold transition-all select-none ${
 allRowGranted
 ? "bg-tone-red-bg text-tone-red-text hover:bg-tone-red-bg border border-tone-red-solid "
 : "bg-muted text-ink-secondary hover:bg-active border border-border "
 }`}
 >
 {allRowGranted ? "Revoke All" : "Grant All"}
 </button>
 </td>
 </tr>
 )
 })}
 </tbody>
 </table>

 {filteredMatrix.length === 0 && (
 <div className="py-16 text-center">
 <Shield size={36} className="mx-auto text-ink-placeholder mb-2" />
 <p className="text-sm font-extrabold text-ink ">
 No matching capabilities found
 </p>
 <p className="text-xs text-ink-secondary mt-1">
 Try clearing your search query.
 </p>
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {/* 5. MODAL: CREATE USER (PORTALED TO BODY TO PREVENT ANY STACKING/WHITE STRIP ISSUES) */}
 {userOpen && (
 <Modal
 title="Create New User"
 subtitle="Provision an employee or administrative member with initial role assignment"
 error={dialogError}
 close={() => setUserOpen(false)}
 >
 <form onSubmit={createUser} className="space-y-4 font-manrope">
 <div>
 <label className="block text-xs font-bold text-ink-secondary mb-1">
 Full Name
 </label>
 <Input
 placeholder="e.g. Fardeen Khan"
 value={userForm.name}
 onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
 className="h-10 text-xs font-bold rounded-xl border-border-strong bg-white "
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-ink-secondary mb-1">
 Work Email Address <span className="text-tone-red-text">*</span>
 </label>
 <Input
 type="email"
 placeholder="fardeen@plinth-international.com"
 value={userForm.email}
 onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
 required
 className="h-10 text-xs font-bold rounded-xl border-border-strong bg-white "
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-ink-secondary mb-1">
 Temporary Password <span className="text-tone-red-text">*</span>
 </label>
 <Input
 type="password"
 placeholder="At least 8 characters"
 value={userForm.password}
 onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
 minLength={8}
 required
 className="h-10 text-xs font-bold rounded-xl border-border-strong bg-white "
 />
 <p className="text-[10px] text-ink-secondary mt-1">
 The user can change their password upon their first login.
 </p>
 </div>

 <div>
 <label className="block text-xs font-bold text-ink-secondary mb-1">
 Initial Security Role Assignment
 </label>
 <select
 value={userForm.roleDefinitionId}
 onChange={(e) => setUserForm({ ...userForm, roleDefinitionId: e.target.value })}
 className="w-full h-10 rounded-xl border border-border-strong bg-white px-3 text-xs font-bold text-ink outline-none"
 >
 <option value="">Employee (Default Base Access)</option>
 {roles
 .filter((r) => r.isActive !== false)
 .map((r) => (
 <option key={r.id} value={r.id}>
 {pretty(r.name)} {r.isSystem ? "(System Role)" : ""}
 </option>
 ))}
 </select>
 </div>

 <div className="flex justify-end gap-2 border-t border-border pt-4 mt-6">
 <Button
 type="button"
 variant="outline"
 onClick={() => setUserOpen(false)}
 className="text-xs font-bold rounded-xl border-border-strong"
 >
 Cancel
 </Button>
 <Button
 type="submit"
 disabled={userSubmitting}
 className="bg-inverse hover:bg-[#2E2E2E] active:bg-[#000000] text-white font-black text-xs rounded-xl"
 >
 {userSubmitting ? "Creating User..." : "Create User Account"}
 </Button>
 </div>
 </form>
 </Modal>
 )}

 {/* 6. MODAL: CREATE ROLE (PORTALED TO BODY TO PREVENT ANY STACKING/WHITE STRIP ISSUES) */}
 {roleOpen && (
 <Modal
 title="Create Custom Security Role"
 subtitle="Define a reusable permission profile with granular module access"
 error={dialogError}
 close={() => setRoleOpen(false)}
 >
 <form onSubmit={createRole} className="space-y-4 font-manrope">
 <div>
 <label className="block text-xs font-bold text-ink-secondary mb-1">
 Role Display Name <span className="text-tone-red-text">*</span>
 </label>
 <Input
 placeholder="e.g. Procurement Lead"
 value={roleForm.name}
 onChange={(e) => {
 const val = e.target.value
 setRoleForm({
 ...roleForm,
 name: val,
 key:
 roleForm.key === "" ||
 roleForm.key ===
 roleForm.name
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-|-$/g, "")
 ? val
 .toLowerCase()
 .replace(/[^a-z0-9]+/g, "-")
 .replace(/^-|-$/g, "")
 : roleForm.key,
 })
 }}
 required
 className="h-10 text-xs font-bold rounded-xl border-border-strong bg-white "
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-ink-secondary mb-1">
 Role Slug Identifier <span className="text-tone-red-text">*</span>
 </label>
 <Input
 placeholder="e.g. procurement-lead"
 value={roleForm.key}
 onChange={(e) => setRoleForm({ ...roleForm, key: e.target.value })}
 required
 className="h-10 text-xs font-bold rounded-xl border-border-strong font-mono bg-white "
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-ink-secondary mb-1">
 Description
 </label>
 <Input
 placeholder="e.g. Responsible for approving purchase orders and vendor evaluations"
 value={roleForm.description}
 onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
 className="h-10 text-xs font-bold rounded-xl border-border-strong bg-white "
 />
 </div>

 <div>
 <label className="block text-xs font-bold text-ink-secondary mb-1">
 Clone Base Permissions From (Optional)
 </label>
 <select
 value={roleForm.cloneFromRoleId}
 onChange={(e) => setRoleForm({ ...roleForm, cloneFromRoleId: e.target.value })}
 className="w-full h-10 rounded-xl border border-border-strong bg-white px-3 text-xs font-bold text-ink outline-none"
 >
 <option value="">Start Empty (No initial permissions)</option>
 {roles.map((r) => (
 <option key={r.id} value={r.id}>
 Clone from: {pretty(r.name)} ({r.permissions.filter((p) => p.assigned).length}{" "}
 grants)
 </option>
 ))}
 </select>
 </div>

 <div className="flex justify-end gap-2 border-t border-border pt-4 mt-6">
 <Button
 type="button"
 variant="outline"
 onClick={() => setRoleOpen(false)}
 className="text-xs font-bold rounded-xl border-border-strong"
 >
 Cancel
 </Button>
 <Button
 type="submit"
 disabled={roleSubmitting}
 className="bg-inverse hover:bg-[#2E2E2E] active:bg-[#000000] text-white font-black text-xs rounded-xl"
 >
 {roleSubmitting ? "Creating..." : "Create Role"}
 </Button>
 </div>
 </form>
 </Modal>
 )}
 </div>
 )
}

/**
 * Creative, clean, and consistent matrix toggle cell
 */
function CleanMatrixCell({
 permissions,
 draft,
 disabled,
 onToggle,
}: {
 permissions: Permission[]
 draft: string[]
 disabled?: boolean
 onToggle: (id: string) => void
}) {
 if (!permissions.length) {
 return <span className="text-ink-placeholder font-bold select-none">—</span>
 }

 // If there is only 1 permission in this bucket (the vast majority of actions)
 if (permissions.length === 1) {
 const p = permissions[0]
 const isAssigned = draft.includes(p.id)
 const actionName = pretty(p.action)

 return (
 <div className="flex justify-center">
 <button
 type="button"
 disabled={disabled}
 title={p.description || `${p.action} on ${p.resource}`}
 onClick={() => onToggle(p.id)}
 className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-black transition-all select-none ${
 isAssigned
 ? "bg-[var(--accent-blue)] text-white shadow-2xs ring-1 ring-[var(--accent-blue)] hover:bg-[var(--accent-hover)] scale-[1.02]"
 : "bg-muted text-ink-secondary border border-border hover:border-border-strong hover:text-[var(--accent-blue)] "
 } disabled:cursor-not-allowed disabled:opacity-50`}
 >
 <span
 className={`flex h-4 w-4 items-center justify-center rounded-md transition-colors ${
 isAssigned
 ? "bg-white text-[var(--accent-blue)] shadow-xs"
 : "border-2 border-border-strong group-hover:border-border-strong"
 }`}
 >
 {isAssigned ? (
 <Check size={11} strokeWidth={3.5} />
 ) : (
 <span className="h-1 w-1 rounded-full bg-active " />
 )}
 </span>
 <span className="truncate">{actionName}</span>
 </button>
 </div>
 )
 }

 // If there are multiple permissions in this bucket (e.g. approve + self_approve)
 return (
 <div className="flex flex-col items-center gap-1.5">
 {permissions.map((p) => {
 const isAssigned = draft.includes(p.id)
 const actionName = pretty(p.action)

 return (
 <button
 key={p.id}
 type="button"
 disabled={disabled}
 title={p.description || `${p.action} on ${p.resource}`}
 onClick={() => onToggle(p.id)}
 className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black transition-all select-none w-full max-w-[125px] justify-between ${
 isAssigned
 ? "bg-[var(--accent-blue)] text-white shadow-2xs ring-1 ring-[var(--accent-blue)] hover:bg-[var(--accent-hover)]"
 : "bg-muted text-ink-secondary border border-border hover:border-border-strong hover:text-[var(--accent-blue)] "
 } disabled:cursor-not-allowed disabled:opacity-50`}
 >
 <span className="truncate">{actionName}</span>
 <span
 className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded transition-colors ${
 isAssigned
 ? "bg-white text-[var(--accent-blue)]"
 : "border-2 border-border-strong group-hover:border-border-strong"
 }`}
 >
 {isAssigned && <Check size={10} strokeWidth={3.5} />}
 </span>
 </button>
 )
 })}
 </div>
 )
}

/**
 * Modern floating modal container using React Portal directly to document.body
 * This guarantees 100% fullscreen coverage from top:0 to bottom:0, fixing any stacking context or white strip bugs.
 */
function Modal({
 title,
 subtitle,
 error,
 close,
 children,
}: {
 title: string
 subtitle?: string
 error?: string | null
 close: () => void
 children: ReactNode
}) {
 const [mounted, setMounted] = useState(false)

 useEffect(() => {
 setMounted(true)
 const handleKeyDown = (e: KeyboardEvent) => {
 if (e.key === "Escape") close()
 }
 window.addEventListener("keydown", handleKeyDown)
 return () => window.removeEventListener("keydown", handleKeyDown)
 }, [close])

 if (!mounted || typeof document === "undefined") return null

 return createPortal(
 <div
 className="fixed inset-0 top-0 left-0 right-0 bottom-0 z-[999999] flex items-center justify-center bg-[color:var(--overlay)] p-4 backdrop-blur-xs font-manrope"
 style={{ margin: 0, padding: "1rem" }}
 onMouseDown={close}
 >
 <div
 className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-white shadow-2xl transition-all"
 onMouseDown={(e) => e.stopPropagation()}
 >
 <div className="h-1.5 bg-[var(--accent-blue)] w-full" />
 <div className="flex items-center justify-between border-b border-border p-6">
 <div>
 <p className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-blue)] ">
 Access & Security Control
 </p>
 <h2 className="mt-0.5 text-lg font-black text-ink font-manrope">
 {title}
 </h2>
 {subtitle && (
 <p className="text-xs text-ink-secondary font-manrope">{subtitle}</p>
 )}
 </div>
 <button
 type="button"
 aria-label="Close modal"
 onClick={close}
 className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-muted hover:text-ink-secondary "
 >
 <X size={18} />
 </button>
 </div>

 <div className="p-6">
 {error && (
 <div className="mb-4 rounded-xl border border-tone-red-solid bg-tone-red-bg p-3 text-xs font-bold text-tone-red-text ">
 {error}
 </div>
 )}
 {children}
 </div>
 </div>
 </div>,
 document.body
 )
}
