'use client';

import { Checkbox } from '@plinth/ui';
import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { hrApi } from '@/features/hr/api';
import { authenticatedApiRequest } from '@/features/auth/api';
import { useCurrentUser } from '@/features/auth/hooks';
import { useDepartments } from '@/hooks/useMasterData';
import { showToast } from '@/components/toast-store';
import {
  UserPlus,
  ArrowLeft,
  Copy,
  CheckCircle2,
  AlertCircle,
  BadgeIndianRupee,
  Mail,
  Briefcase,
  Layers,
  KeyRound,
  FileCheck,
  ShieldCheck,
  UserCheck,
  Sparkles,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { Button, Dialog } from '@plinth/ui';
import { getEmployeeOnboardingLink } from '@/lib/env';

interface RoleItem {
  id: string;
  key: string;
  name: string;
  description?: string;
  permissions?: Array<{ id: string; key: string; action: string; resource: string; name?: string; assigned?: boolean }>;
}

const DEFAULT_MODULE_PERMISSIONS: Record<string, { label: string; description: string; permissions: Array<{ action: string; resource: string; key: string }> }> = {
  Dashboard: { label: 'Dashboard & Metrics', description: 'View system analytics, KPIs, and executive reporting widgets', permissions: [{ action: 'read', resource: 'Dashboard', key: 'read:dashboard' }] },
  Product: { label: 'Product Catalog & Master Data', description: 'Finished goods, formulations, categories, and SKU definitions', permissions: [{ action: 'read', resource: 'Product', key: 'read:product' }, { action: 'create', resource: 'Product', key: 'create:product' }, { action: 'update', resource: 'Product', key: 'update:product' }] },
  Material: { label: 'Raw Materials & Stores', description: 'Raw material catalogue, standard costs, and stock items', permissions: [{ action: 'read', resource: 'Material', key: 'read:material' }, { action: 'create', resource: 'Material', key: 'create:material' }] },
  Inventory: { label: 'Inventory & Stock Ledgers', description: 'Warehouse stock balance, bin locations, and inventory ledger movements', permissions: [{ action: 'read', resource: 'Inventory', key: 'read:inventory' }, { action: 'read', resource: 'StockLedgerEntry', key: 'read:stockledgerentry' }] },
  Procurement: { label: 'Procurement & Purchase Orders', description: 'Requisitions, supplier POs, and vendor procurement lifecycle', permissions: [{ action: 'read', resource: 'PurchaseOrder', key: 'read:purchaseorder' }, { action: 'create', resource: 'PurchaseOrder', key: 'create:purchaseorder' }] },
  GoodsReceipt: { label: 'Goods Receiving (GRN)', description: 'Inbound physical intake, verifications, and GRN postings', permissions: [{ action: 'read', resource: 'GoodsReceiptNote', key: 'read:goodsreceiptnote' }, { action: 'create', resource: 'GoodsReceiptNote', key: 'create:goodsreceiptnote' }] },
  Production: { label: 'Manufacturing & Shop Floor Execution', description: 'Production planning, schedules, BOM recipes, and work station logs', permissions: [{ action: 'read', resource: 'Production', key: 'read:production' }, { action: 'view', resource: 'ProductionPlan', key: 'view:productionplan' }, { action: 'view', resource: 'BomVersion', key: 'view:bomversion' }] },
  Sales: { label: 'Sales & Customer Orders', description: 'Customer sales orders, pricing, fulfillment dispatch, and dealer accounts', permissions: [{ action: 'read', resource: 'SalesOrder', key: 'read:salesorder' }, { action: 'create', resource: 'SalesOrder', key: 'create:salesorder' }] },
  Quality: { label: 'Quality Control & Loss Management', description: 'Quality inspection logs, scrap & wastage reporting, and disposition', permissions: [{ action: 'read', resource: 'LossEvent', key: 'read:lossevent' }] },
  HR: { label: 'HR, Staff & Attendance', description: 'Employee directory, onboarding management, and attendance logs', permissions: [{ action: 'read', resource: 'EmployeeMaster', key: 'read:employeemaster' }] },
};

const EMPLOYEE_CREATION_DRAFT_KEY = 'plinth_employee_creation_draft_v1';

interface EmployeeCreationDraft {
  formData: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
    designation: string;
    departmentId: string;
    gender: string;
    ranking: number;
    hierarchyLevel: number;
    baseSalary: number;
    hourlyRate: string;
    tempPassword: string;
  };
  selectedRoleId?: string;
  savedAt: string;
}

export default function NewEmployeeInvitePage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: currentUser } = useCurrentUser();
  const { data: departmentsData } = useDepartments('ACTIVE');
  const currentRoleKeys = [currentUser?.role, currentUser?.roleDefinition?.key, ...(currentUser?.roles || []).map((role) => role.key)]
    .map((role) => String(role || '').toLowerCase().replace(/[\s-]+/g, '_'));
  const isDepartmentHead = currentRoleKeys.some((role) => ['department_head', 'dept_head'].includes(role));
  const workerMode = searchParams.get('mode') === 'shop-floor-worker' || isDepartmentHead;
  const requestedDepartmentId = isDepartmentHead ? currentUser?.assignedDepartmentId : searchParams.get('departmentId');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'Employee',
    designation: '',
    departmentId: '',
    gender: 'Male',
    ranking: 1,
    hierarchyLevel: 4,
    baseSalary: 35000,
    hourlyRate: '',
    tempPassword: ''
  });

  const [loading, setLoading] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    email: string;
    tempPassword: string;
    onboardingToken: string;
    inviteLink: string;
    employeeId: string;
    userId: string;
    roleName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (!workerMode || !requestedDepartmentId) return;
    setFormData((current) => ({ ...current, departmentId: requestedDepartmentId, role: 'Shop Floor Operator', designation: 'Shop Floor Operator', hierarchyLevel: 5, baseSalary: 0 }));
  }, [workerMode, requestedDepartmentId]);

  // User Access & Role Selection Step
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [roleAssigned, setRoleAssigned] = useState(false);

  // New Role Creation Modal State
  const [createRoleModalOpen, setCreateRoleModalOpen] = useState(false);
  const [newRoleForm, setNewRoleForm] = useState({
    name: '',
    description: '',
    selectedModules: ['Dashboard', 'HR'] as string[],
  });
  const [creatingRole, setCreatingRole] = useState(false);

  const fetchRolesList = React.useCallback(async (selectCreatedId?: string) => {
    setLoadingRoles(true);
    try {
      // 1. Try fetching from dedicated roles API
      const res = await fetch('/api/v1/roles', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      let fetchedRoles: RoleItem[] = [];

      if (res.ok && data?.success && Array.isArray(data?.data?.roles) && data.data.roles.length > 0) {
        fetchedRoles = data.data.roles;
      } else {
        // 2. Fallback to access bootstrap API
        const bootstrapRes = await authenticatedApiRequest<{ roles?: RoleItem[] }>('/access/bootstrap?page=1&limit=100').catch(() => null);
        if (bootstrapRes?.data?.roles && Array.isArray(bootstrapRes.data.roles) && bootstrapRes.data.roles.length > 0) {
          fetchedRoles = bootstrapRes.data.roles;
        }
      }

      if (fetchedRoles.length > 0) {
        setRoles(fetchedRoles);
        if (selectCreatedId) {
          setSelectedRoleId(selectCreatedId);
        } else {
          setSelectedRoleId((current) => {
            if (current && fetchedRoles.some((r) => r.id === current)) return current;
            const defaultRole = fetchedRoles.find((r) => r.key === 'employee' || r.name.toLowerCase().includes('employee')) || fetchedRoles[0];
            return defaultRole.id;
          });
        }
      }
    } catch {
      // Fallback gracefully
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  // Restore draft on mount
  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(EMPLOYEE_CREATION_DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as EmployeeCreationDraft;
          if (parsed.formData) {
            setFormData((prev) => ({ ...prev, ...parsed.formData }));
            setIsDraftRestored(true);
          }
          if (parsed.selectedRoleId) {
            setSelectedRoleId(parsed.selectedRoleId);
          }
          if (parsed.savedAt) {
            setDraftSavedAt(parsed.savedAt);
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    } finally {
      setIsDraftLoaded(true);
    }
  }, []);

  // Auto-save draft when formData or selectedRoleId changes
  React.useEffect(() => {
    if (!isDraftLoaded || result) return;

    const hasContent = Boolean(
      formData.firstName.trim() ||
      formData.lastName.trim() ||
      formData.email.trim() ||
      formData.phone.trim() ||
      formData.designation.trim() ||
      formData.tempPassword.trim() ||
      formData.hourlyRate.trim() ||
      formData.baseSalary !== 35000
    );

    if (!hasContent) return;

    try {
      const now = new Date().toISOString();
      const draft: EmployeeCreationDraft = {
        formData,
        selectedRoleId,
        savedAt: now,
      };
      localStorage.setItem(EMPLOYEE_CREATION_DRAFT_KEY, JSON.stringify(draft));
      setDraftSavedAt(now);
    } catch {
      // Ignore localStorage quotas
    }
  }, [formData, selectedRoleId, isDraftLoaded, result]);

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(EMPLOYEE_CREATION_DRAFT_KEY);
    } catch {
      // Ignore
    }
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      role: 'Employee',
      designation: '',
      departmentId: '',
      gender: 'Male',
      ranking: 1,
      hierarchyLevel: 4,
      baseSalary: 35000,
      hourlyRate: '',
      tempPassword: '',
    });
    setDraftSavedAt(null);
    setIsDraftRestored(false);
    showToast({
      kind: 'info',
      title: 'Draft Discarded',
      message: 'The saved employee registration form was cleared.',
    });
  };

  // Load RBAC Roles on initial render
  React.useEffect(() => {
    void fetchRolesList();
  }, [fetchRolesList]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await hrApi.inviteEmployee({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        role: workerMode ? 'Shop Floor Operator' : formData.role,
        designation: workerMode ? 'Shop Floor Operator' : formData.designation,
        departmentId: formData.departmentId || undefined,
        gender: formData.gender,
        ranking: formData.ranking,
        hierarchyLevel: formData.hierarchyLevel,
        baseSalary: workerMode ? 0 : formData.baseSalary,
        tempPassword: formData.tempPassword || undefined,
        accessRoleKey: workerMode ? 'shop_floor_operator' : (roles.find((role) => role.id === selectedRoleId)?.key || undefined)
      });
      const initialRoleName = formData.role || 'Employee';
      // Clear draft on successful invitation
      try {
        localStorage.removeItem(EMPLOYEE_CREATION_DRAFT_KEY);
        setDraftSavedAt(null);
      } catch {
        // Ignore
      }

      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });

      setResult({
        email: res.user.email,
        tempPassword: res.tempPassword,
        onboardingToken: res.onboardingToken,
        inviteLink: getEmployeeOnboardingLink(res.user.email, res.inviteLink),
        employeeId: res.employee.id,
        userId: res.user.id,
        roleName: res.accessRoleName || initialRoleName,
      });
      if (!workerMode && selectedRoleId && res.user.id) {
        void handleSaveAccessRole(res.user.id, selectedRoleId);
      } else if (workerMode) {
        setRoleAssigned(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create employee credentials');
    } finally {
      setLoading(false);
    }
  };
  const handleSaveAccessRole = async (userId: string, roleDefinitionId: string) => {
    if (!userId || !roleDefinitionId) return;
    setSavingRole(true);
    try {
      const res = await fetch(`/api/v1/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ roleDefinitionId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setRoleAssigned(true);
        const assignedRole = roles.find((r) => r.id === roleDefinitionId);
        if (assignedRole) {
          setResult((prev) => (prev ? { ...prev, roleName: assignedRole.name } : null));
        }
        showToast({
          kind: 'success',
          title: 'Access Role Assigned',
          message: `Role "${assignedRole?.name || 'Selected Role'}" successfully assigned to user account.`,
        });
      }
    } catch {
      // Handled inline
    } finally {
      setSavingRole(false);
    }
  };

  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleForm.name.trim()) {
      showToast({ kind: 'error', title: 'Role Name Required', message: 'Enter a valid name for the new role.' });
      return;
    }
    setCreatingRole(true);
    try {
      const roleKey = newRoleForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || `role-${Date.now()}`;

      // Collect matching permission UUIDs from available catalogue
      const allCatalogPermissions = roles.flatMap((r) => r.permissions || []);
      const matchedPermissionIds: string[] = [];
      const seenPermIds = new Set<string>();

      for (const modKey of newRoleForm.selectedModules) {
        const modConfig = DEFAULT_MODULE_PERMISSIONS[modKey];
        if (modConfig) {
          for (const p of modConfig.permissions) {
            const found = allCatalogPermissions.find((cp) => cp.action === p.action && cp.resource === p.resource);
            if (found && !seenPermIds.has(found.id)) {
              seenPermIds.add(found.id);
              matchedPermissionIds.push(found.id);
            }
          }
        }
      }

      const res = await fetch('/api/v1/roles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          key: roleKey,
          name: newRoleForm.name.trim(),
          description: newRoleForm.description.trim() || undefined,
          permissionIds: matchedPermissionIds,
        }),
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.data?.role) {
        const createdId = data.data.role.id;
        showToast({
          kind: 'success',
          title: 'Role Created & Configured',
          message: `Role "${newRoleForm.name}" created with ${newRoleForm.selectedModules.length} permitted modules.`,
        });
        setCreateRoleModalOpen(false);
        setNewRoleForm({ name: '', description: '', selectedModules: ['Dashboard', 'HR'] });
        await fetchRolesList(createdId);
        if (result?.userId) {
          void handleSaveAccessRole(result.userId, createdId);
        }
      } else {
        const errMsg = data?.error?.message || 'Failed to create role definition.';
        showToast({ kind: 'error', title: 'Role Creation Failed', message: errMsg });
      }
    } catch (err: unknown) {
      showToast({ kind: 'error', title: 'Role Creation Error', message: err instanceof Error ? err.message : 'Unable to create role' });
    } finally {
      setCreatingRole(false);
    }
  };
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-muted/20 p-6 md:p-8 space-y-6">
      {/* Top Header Card */}
      <div className="bg-card rounded-xl border border-border shadow-xs p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Add New Employee &amp; Generate Credentials
              </h1>
              {draftSavedAt && !result && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
                  <Sparkles className="w-3 h-3 text-primary" /> Draft Saved
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Provision employee credentials, define organizational hierarchy &amp; compensation, and issue single-use onboarding invites.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {draftSavedAt && !result && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDiscardDraft}
              className="text-destructive hover:bg-destructive/10 text-xs"
            >
              Discard Draft
            </Button>
          )}
          <Link href="/hr/directory">
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <ArrowLeft className="w-4 h-4" />
              Back to Directory
            </Button>
          </Link>
        </div>
      </div>

      {isDraftRestored && !result && (
        <div className="p-3 bg-muted border border-border rounded-lg flex items-center justify-between text-xs text-foreground">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span>Restored unfinished draft from your previous session.</span>
          </div>
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="font-semibold underline hover:text-primary text-[11px] cursor-pointer"
          >
            Reset Form
          </button>
        </div>
      )}

      {result ? (
        <div className="bg-card border border-border rounded-xl shadow-xs p-6 space-y-6">
          <div className="flex items-center space-x-3 text-tone-green-text">
            <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Credentials & Invite Generated</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                The employee profile has been created, login credentials generated with mandatory password change, and the onboarding invite link is ready.
              </p>
            </div>
          </div>

          {/* Top Credentials & Invite Banner */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted/30 p-4 rounded-lg border border-border">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-primary" />
                Work Email / Login ID
              </span>
              <p className="text-sm font-bold text-foreground mt-2 font-mono">{result.email}</p>
              <span className="text-[11px] text-muted-foreground">Active login account</span>
            </div>

            <div className="bg-muted/30 p-4 rounded-lg border border-border">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-tone-amber-text" />
                Temporary Password
              </span>
              <div className="flex items-center justify-between mt-2 bg-background px-3 py-1.5 rounded-lg border border-border">
                <span className="font-mono text-xs font-bold text-foreground">
                  {result.tempPassword}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(result.tempPassword)}
                  className="h-6 px-2 text-xs font-medium gap-1 text-primary"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </Button>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">Forces new password on first login</span>
            </div>

            <div className="bg-muted/30 p-4 rounded-lg border border-border">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileCheck className="w-3.5 h-3.5 text-tone-green-text" />
                Single-Use Onboarding Link
              </span>
              <div className="flex items-center justify-between mt-2 bg-background px-3 py-1.5 rounded-lg border border-border">
                <span className="font-mono text-xs truncate max-w-[200px] text-muted-foreground">
                  {result.inviteLink}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(result.inviteLink)}
                  className="h-6 px-2 text-xs font-medium gap-1 text-primary"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </Button>
              </div>
              <span className="text-[11px] text-muted-foreground mt-1 block">Sent to employee for wizard completion</span>
            </div>
          </div>

          {!workerMode && (
            <>
          {/* User Access & Roles Configuration Card */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-border-strong border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    Application Access & Role Allocation
                    {roleAssigned && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-foreground border border-border">
                        <CheckCircle2 className="w-3 h-3 text-tone-green-text" /> Active Grant
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Select which enterprise modules, catalogs, and operational sections this employee is permitted to view and manage.
                  </p>
                </div>
              </div>

              <Link
                href="/access"
                target="_blank"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <span>Full Access Matrix</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
              <div className="lg:col-span-1 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-foreground">
                    Assigned Security Role <span className="text-destructive">*</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCreateRoleModalOpen(true)}
                    className="h-6 px-2 text-xs font-medium text-primary gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    New Role
                  </Button>
                </div>
                <select
                  value={selectedRoleId}
                  disabled={loadingRoles || savingRole}
                  onChange={(e) => {
                    const newRoleId = e.target.value;
                    setSelectedRoleId(newRoleId);
                    if (result.userId) {
                      void handleSaveAccessRole(result.userId, newRoleId);
                    }
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-border bg-background font-medium text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="" disabled>
                    {loadingRoles ? 'Loading security roles...' : 'Select Access Role'}
                  </option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.description ? `— ${r.description}` : ''}
                    </option>
                  ))}
                </select>

                <p className="text-[11px] text-muted-foreground">
                  {savingRole ? 'Updating security grants...' : 'Selecting a role grants instant access to authorized modules upon employee login.'}
                </p>
              </div>

              {/* Permitted Modules & Sections Preview */}
              <div className="lg:col-span-2 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                  Permitted Modules for &quot;{roles.find((r) => r.id === selectedRoleId)?.name || result.roleName}&quot;
                </span>

                {(() => {
                  const currentRole = roles.find((r) => r.id === selectedRoleId);
                  const permissions = currentRole?.permissions || [];
                  const uniqueResources = Array.from(
                    new Set(permissions.map((p) => p.key?.split(':')[1] || p.name || 'Core'))
                  );

                  return (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
                      {uniqueResources.length > 0 ? (
                        uniqueResources.map((resName) => (
                          <span
                            key={resName}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-background text-foreground border border-border"
                          >
                            <UserCheck className="w-3 h-3 text-primary" />
                            {resName}
                          </span>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground py-1 flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-primary" />
                          <span>Standard Employee Portal (Attendance, Personal Tasks &amp; Profile)</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

            </>
          )}
          {copied && (
            <p className="text-xs text-tone-green-text font-medium text-center bg-muted py-2 rounded-lg border border-border">
              Copied to clipboard!
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
            <Link href={`/hr/employees/${result.employeeId}`}>
              <Button variant="outline" size="sm" className="text-xs">
                View Employee Profile
              </Button>
            </Link>
            <Link href="/hr/directory">
              <Button size="sm" className="text-xs">
                Return to Employee Directory
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 bg-tone-red-solid border border-tone-red-solid/25 text-tone-red-text rounded-2xl text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Basic & Contact Details */}
          <div className="bg-card rounded-xl border border-border shadow-xs p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-2.5 text-primary border-border-strong border-border pb-3">
              <Briefcase className="w-5 h-5" />
              <h2 className="text-sm font-bold text-foreground">1. Basic & Identity Information</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  First Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="e.g. Rahul"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Last Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="e.g. Sharma"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Work Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="rahul.sharma@plinth.local"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Organizational Hierarchy, Role & Ranking */}
          <div className="bg-card rounded-xl border border-border shadow-xs p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-2.5 text-primary border-border-strong border-border pb-3">
              <Layers className="w-5 h-5" />
              <h2 className="text-sm font-bold text-foreground">2. Organizational Placement & Role Hierarchy</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Designation / Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="e.g. Senior QC Lead / Store Executive"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1.5">Department *</label>
                <select required value={formData.departmentId} disabled={workerMode && Boolean(requestedDepartmentId)} onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })} className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">Select department</option>
                  {(departmentsData?.items || []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-Binary">Non-Binary</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Hierarchy Level *
                </label>
                <select
                  value={formData.hierarchyLevel}
                  onChange={(e) => setFormData({ ...formData, hierarchyLevel: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value={1}>Level 1 — Executive / CXO / Director</option>
                  <option value={2}>Level 2 — Department Head / Plant Manager</option>
                  <option value={3}>Level 3 — Team Lead / Line Supervisor</option>
                  <option value={4}>Level 4 — Senior Staff / Specialist</option>
                  <option value={5}>Level 5 — Associate / Floor Operator</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Employee Ranking (1 - 10) *
                </label>
                <select
                  value={formData.ranking}
                  onChange={(e) => setFormData({ ...formData, ranking: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => (
                    <option key={r} value={r}>
                      Rank {r} {r >= 8 ? '(High Priority / CXO)' : r >= 5 ? '(Core Lead)' : '(Operational)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Compensation & Access Provisioning */}
          {!workerMode && (
          <div className="bg-card rounded-xl border border-border shadow-xs p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-2.5 text-primary border-border-strong border-border pb-3">
              <BadgeIndianRupee className="w-5 h-5" />
              <h2 className="text-sm font-bold text-foreground">3. Compensation & Credential Generation</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Base Monthly Gross Salary (₹) *
                </label>
                <input
                  type="number"
                  required
                  value={formData.baseSalary}
                  onChange={(e) => setFormData({ ...formData, baseSalary: Number(e.target.value) })}
                  placeholder="35000"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Hourly Rate (₹) (Optional)
                </label>
                <input
                  type="number"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                  placeholder="e.g. 250"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-medium text-foreground mb-1.5">
                  Custom Temp Password (Optional)
                </label>
                <input
                  type="text"
                  value={formData.tempPassword}
                  onChange={(e) => setFormData({ ...formData, tempPassword: e.target.value })}
                  placeholder="Leave blank to auto-generate secure password"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
              </div>
            </div>
          </div>

          )}
          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3 p-4 bg-card rounded-xl border border-border shadow-xs">
            <Link href="/hr/directory">
              <Button type="button" variant="ghost" size="sm" className="text-xs">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={loading}
              size="sm"
              className="gap-2 text-xs"
            >
              <UserPlus className="w-4 h-4" />
              {loading ? 'Creating Employee & Credentials...' : 'Create & Generate Link'}
            </Button>
          </div>
        </form>
      )}

      {/* Create New Role Dialog */}
      <Dialog
        open={createRoleModalOpen}
        onClose={() => setCreateRoleModalOpen(false)}
        title="Create New Role & Define Permissions"
        description="Specify permitted application modules and operational sections for this role."
        className="max-w-2xl"
      >
        <form onSubmit={handleCreateCustomRole} className="space-y-4 text-xs">
          <div className="space-y-3">
            <div>
              <label className="block font-medium text-foreground mb-1">
                Role Title / Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                required
                value={newRoleForm.name}
                onChange={(e) => setNewRoleForm({ ...newRoleForm, name: e.target.value })}
                placeholder="e.g. Quality Assurance Supervisor"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block font-medium text-foreground mb-1">
                Description &amp; Operational Scope
              </label>
              <input
                type="text"
                value={newRoleForm.description}
                onChange={(e) => setNewRoleForm({ ...newRoleForm, description: e.target.value })}
                placeholder="e.g. Oversees station quality inspections and defect logging"
                className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-xs text-foreground">
                  Permitted Application Sections &amp; Modules
                </span>
                <p className="text-[11px] text-muted-foreground">Check all functional areas this role is authorized to see in navigation.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const allKeys = Object.keys(DEFAULT_MODULE_PERMISSIONS);
                  const allSelected = allKeys.every((k) => newRoleForm.selectedModules.includes(k));
                  setNewRoleForm({
                    ...newRoleForm,
                    selectedModules: allSelected ? ['Dashboard'] : allKeys,
                  });
                }}
                className="text-xs h-7 px-2 text-primary"
              >
                Toggle All
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
              {Object.entries(DEFAULT_MODULE_PERMISSIONS).map(([modKey, modInfo]) => {
                const isChecked = newRoleForm.selectedModules.includes(modKey);
                return (
                  <label
                    key={modKey}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border transition cursor-pointer ${
                      isChecked
                        ? 'bg-primary/5 border-primary'
                        : 'bg-muted/30 border-border opacity-75'
                    }`}
                  >
                    <Checkbox

                      checked={isChecked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...newRoleForm.selectedModules, modKey]
                          : newRoleForm.selectedModules.filter((m) => m !== modKey);
                        setNewRoleForm({ ...newRoleForm, selectedModules: next });
                      }}
                      className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <div className="space-y-0.5">
                      <span className="font-semibold text-xs text-foreground block">{modInfo.label}</span>
                      <span className="text-[10px] text-muted-foreground block leading-tight">{modInfo.description}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-border gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateRoleModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={creatingRole || !newRoleForm.name.trim()}
              size="sm"
              className="gap-1.5 text-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              {creatingRole ? 'Creating Role...' : 'Save & Assign Role'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
