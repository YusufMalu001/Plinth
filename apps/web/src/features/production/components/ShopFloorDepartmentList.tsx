'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
 Card,
 Table,
 TableHeader,
 TableBody,
 TableRow,
 TableHead,
 TableCell,
 Button,
} from '@plinth/ui';
import { User, Pencil, Search, Building2, Trash2, ArrowDownUp, Users, Plus } from 'lucide-react';
import { useDepartments, type Department } from '@/hooks/useMasterData';
import { DepartmentDialog } from '@/components/DepartmentDialog';
import { fetchApi } from '@/features/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { PaginationControls } from '@/components/PaginationControls';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { isProductionExecutionDepartment, isAssemblyDepartment } from '@/features/production/types';
import { showToast } from '@/components/toast-store';
import { useCurrentUser } from '@/features/auth/hooks';
import { AddWorkerModal } from './AddWorkerModal';

const DEPARTMENT_PAGE_SIZE_KEY = 'plinth-table-page-size:shop-floor-departments';

export function ShopFloorDepartmentList() {
 const { data: deptData, isLoading } = useDepartments('ACTIVE');
 const queryClient = useQueryClient();
 const allDepartments = deptData?.items || [];
 const { data: currentUser } = useCurrentUser();
 const roleKeys = [currentUser?.role, currentUser?.roleDefinition?.key, ...(currentUser?.roles || []).map((role) => role.key)]
 .map((role) => String(role || '').toLowerCase().replace(/[\s-]+/g, '_'));
 const canManageWorkers = roleKeys.some((role) => ['admin', 'super_admin', 'department_head', 'department_incharge', 'dept_head'].includes(role));
 const canManageDepartments = roleKeys.some((role) => ['admin', 'super_admin', 'production_manager'].includes(role));

 const [search, setSearch] = useState('');
 const [dialogOpen, setDialogOpen] = useState(false);
 const [editingDept, setEditingDept] = useState<Department | null>(null);
 const [sortField, setSortField] = useState<'updatedAt' | 'name' | 'departmentHead'>('updatedAt');
 const [sortDescending, setSortDescending] = useState(false);
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(20);
 const [workersDepartmentId, setWorkersDepartmentId] = useState<string | null>(null);
 const [addWorkerDepartment, setAddWorkerDepartment] = useState<Department | null>(null);
 const [departmentToDeactivate, setDepartmentToDeactivate] = useState<Department | null>(null);
 const [isDeactivating, setIsDeactivating] = useState(false);
 const [deactivationError, setDeactivationError] = useState<string | null>(null);
 const [workers, setWorkers] = useState<Record<string, Array<{ id: string; employeeCode: string; firstName: string; lastName: string; email: string; status: string; userAccounts?: Array<{ email: string; isActive: boolean }> }>>>({});

 useEffect(() => {
 try {
 const savedPageSize = Number(window.localStorage.getItem(DEPARTMENT_PAGE_SIZE_KEY));
 if ([10, 20, 50, 100].includes(savedPageSize)) setPageSize(savedPageSize);
 } catch {
 // Keep the default page size when browser storage is unavailable.
 }
 }, []);

 const shopFloorDepartments = useMemo(
 () => allDepartments.filter((department) =>
 (
 isProductionExecutionDepartment(department) ||
 isAssemblyDepartment(department) ||
 department.id === currentUser?.assignedDepartmentId
 ) &&
 (!roleKeys.some((role) => ['department_head', 'department_incharge', 'dept_head'].includes(role)) || department.id === currentUser?.assignedDepartmentId)),
 [allDepartments, currentUser?.assignedDepartmentId, roleKeys.join('|')]
 );

 const displayedDepartments = useMemo(() => {
 const list = shopFloorDepartments;
 const term = search.trim().toLowerCase();
 const filtered = !term ? list : list.filter(
 (d) =>
 d.name.toLowerCase().includes(term) ||
 (d.code && d.code.toLowerCase().includes(term)) ||
 (d.departmentHead && d.departmentHead.toLowerCase().includes(term)) ||
 (d.description && d.description.toLowerCase().includes(term))
 );
 return [...filtered].sort((left, right) => {
 if (sortField === 'updatedAt') {
 const leftUpdated = new Date(left.updatedAt || left.createdAt || 0).getTime();
 const rightUpdated = new Date(right.updatedAt || right.createdAt || 0).getTime();
 return rightUpdated - leftUpdated;
 }
 const result = String(left[sortField] ?? '').localeCompare(String(right[sortField] ?? ''), undefined, { sensitivity: 'base' });
 return sortDescending ? result * -1 : result;
 });
 }, [shopFloorDepartments, search, sortField, sortDescending]);

 useEffect(() => setPage(1), [search, sortField, sortDescending]);

 const paginatedDepartments = useMemo(
 () => displayedDepartments.slice((page - 1) * pageSize, page * pageSize),
 [displayedDepartments, page, pageSize]
 );

 const updatePageSize = (nextPageSize: number) => {
 setPageSize(nextPageSize);
 setPage(1);
 try {
 window.localStorage.setItem(DEPARTMENT_PAGE_SIZE_KEY, String(nextPageSize));
 } catch {
 // The selected size still applies for the current view.
 }
 };

 const handleEdit = (dept: Department) => {
 setEditingDept(dept);
 setDialogOpen(true);
 };

 const handleDeactivate = async () => {
 if (!departmentToDeactivate || isDeactivating) return;
 const dept = departmentToDeactivate;
 setIsDeactivating(true);
 setDeactivationError(null);
 try {
 await fetchApi(`/master-data/org/departments/${dept.id}/deactivate`, {
 method: 'POST',
 body: JSON.stringify({ reason: 'Deactivated from Shop Floor Departments' }),
 });
 await queryClient.invalidateQueries({ queryKey: ['departments'] });
 setDepartmentToDeactivate(null);
 showToast({ kind: 'success', title: 'Department deactivated', message: `${dept.name} is now inactive.` });
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Please try again.';
 setDeactivationError(message);
 showToast({ kind: 'error', title: 'Unable to deactivate department', message });
 } finally {
 setIsDeactivating(false);
 }
 };

 const handleSort = (field: 'name' | 'departmentHead') => {
 if (sortField === field) setSortDescending((current) => !current);
 else { setSortField(field); setSortDescending(false); }
 };

 const toggleWorkers = async (dept: Department) => {
 if (workersDepartmentId === dept.id) { setWorkersDepartmentId(null); return; }
 setWorkersDepartmentId(dept.id);
 try {
 const result = await fetchApi<typeof workers[string]>(`/employees/departments/${dept.id}/workers`);
 setWorkers((current) => ({ ...current, [dept.id]: result || [] }));
 } catch (error) {
 showToast({ kind: 'error', title: 'Unable to load department workers', message: error instanceof Error ? error.message : 'Please try again.' });
 }
 };

 const refreshWorkers = async (departmentId: string) => {
 const result = await fetchApi<typeof workers[string]>(`/employees/departments/${departmentId}/workers`);
 setWorkers((current) => ({ ...current, [departmentId]: result || [] }));
 };

 return (
 <>
 <Card className="rounded-2xl border border-border overflow-hidden shadow-none w-full bg-card">
 {/* Generic Table Toolbar */}
 <div className="p-4 sm:p-5 border-b border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div className="flex items-center gap-2">
 <span className="text-lg font-bold text-foreground">Shop Floor Departments</span>
 <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
 {displayedDepartments.length} Records
 </span>
 </div>

 <div className="flex flex-wrap items-center gap-3">
 {/* Search Input */}
 <div className="relative w-full sm:w-64">
 <Search className="absolute inset-y-0 left-3 my-auto w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
 <input
 type="text"
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Search departments..."
 className="w-full h-9 pl-8 pr-3 text-xs bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
 />
 </div>

 </div>
 </div>

 {/* Generic Table UI with Solid Primary Blue Header */}
 <div className="w-full overflow-x-auto">
 <Table className="w-full text-xs text-left">
 <TableHeader className="bg-primary text-white border-0 shadow-none [&_tr]:bg-transparent [&_tr]:border-0 [&_th]:text-white">
 <TableRow className="bg-primary hover:bg-primary border-0">
 <TableHead className="w-12 py-3 px-4 text-center font-bold text-xs uppercase tracking-wider text-white">
 #
 </TableHead>
 <TableHead className="w-36 py-3 px-4 font-bold text-xs uppercase tracking-wider text-white whitespace-nowrap">
 Code
 </TableHead>
 <TableHead className="min-w-[200px] py-3 px-4 font-bold text-xs uppercase tracking-wider text-white">
 <button type="button" onClick={() => handleSort('name')} aria-label="Sort by name" className="inline-flex items-center gap-1.5 text-white hover:text-white">Name <ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5" /></button>
 </TableHead>
 <TableHead className="min-w-[180px] py-3 px-4 font-bold text-xs uppercase tracking-wider text-white">
 <button type="button" onClick={() => handleSort('departmentHead')} aria-label="Sort by department head" className="inline-flex items-center gap-1.5 text-white hover:text-white">Department Head <ArrowDownUp aria-hidden="true" className="h-3.5 w-3.5" /></button>
 </TableHead>
 <TableHead className="min-w-[260px] py-3 px-4 font-bold text-xs uppercase tracking-wider text-white">
 Description
 </TableHead>
 <TableHead className="w-52 py-3 px-4 font-bold text-xs uppercase tracking-wider text-white text-right">
 Action
 </TableHead>
 </TableRow>
 </TableHeader>
 <TableBody className="divide-y divide-border/60 bg-card">
 {isLoading ? (
 <TableRow>
 <TableCell colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
 Loading departments…
 </TableCell>
 </TableRow>
 ) : displayedDepartments.length === 0 ? (
 <TableRow>
 <TableCell colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
 No departments found.
 </TableCell>
 </TableRow>
 ) : (
 paginatedDepartments.map((dept, index) => (
 <React.Fragment key={dept.id}>
 <TableRow key={dept.id} className="hover:bg-muted/30 transition-colors">
 <TableCell className="py-3 px-4 text-center font-mono font-semibold text-muted-foreground">
 {(page - 1) * pageSize + index + 1}
 </TableCell>
 <TableCell className="py-3 px-4 whitespace-nowrap">
 {dept.code ? (
 <span className="font-mono text-xs font-bold bg-muted px-2 py-0.5 rounded border border-border text-foreground">
 {dept.code}
 </span>
 ) : (
 <span className="text-muted-foreground/60 italic text-xs">—</span>
 )}
 </TableCell>
 <TableCell className="py-3 px-4">
 <div className="flex items-center gap-2">
 <span className="font-bold text-foreground text-sm flex items-center gap-2">
 <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
 <span>{dept.name}</span>
 </span>
 {Boolean(dept.isAssembly || isAssemblyDepartment(dept)) && (
 <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-tone-green-solid/10 text-tone-green-text border border-tone-green-solid/25/20">
 Assembly Station
 </span>
 )}
 </div>
 </TableCell>
 <TableCell className="py-3 px-4">
 {dept.departmentHead ? (
 <div className="flex items-center gap-1.5 text-foreground text-xs font-medium whitespace-nowrap">
 <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
 <span>{dept.departmentHead}</span>
 </div>
 ) : (
 <span className="text-muted-foreground/60 italic text-xs">—</span>
 )}
 </TableCell>
 <TableCell className="py-3 px-4 text-muted-foreground text-xs max-w-[340px]">
 <span className="line-clamp-2">{dept.description || '—'}</span>
 </TableCell>
 <TableCell className="py-3 px-4 text-right">
 <div className="flex items-center justify-end gap-1">
 <Button type="button" variant="outline" size="sm" onClick={() => void toggleWorkers(dept)} className="h-8 gap-1.5 px-2 text-xs" aria-label={`View workers in ${dept.name}`}>
 <Users className="h-3.5 w-3.5" /> Workers
 </Button>
 {canManageDepartments && <>
 <Button type="button" variant="ghost" size="sm" onClick={() => handleEdit(dept)} className="h-8 w-8 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10" title="Edit department" aria-label={`Edit ${dept.name}`}>
 <Pencil className="w-4 h-4" />
 </Button>
 <Button type="button" variant="ghost" size="sm" onClick={() => { setDepartmentToDeactivate(dept); setDeactivationError(null); }} className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" title="Deactivate department" aria-label={`Deactivate ${dept.name}`}>
 <Trash2 className="w-4 h-4" />
 </Button>
 </>}
 </div>
 </TableCell>
 </TableRow>
 {workersDepartmentId === dept.id && (
 <TableRow key={`${dept.id}-workers`}>
 <TableCell colSpan={6} className="bg-muted/20 p-4">
 <div className="rounded-xl border border-border bg-card p-4">
 <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
 <div><div className="font-semibold text-foreground">Workers in {dept.name}</div><div className="text-xs text-muted-foreground">Department accounts and task assignment roster</div></div>
 {canManageWorkers && <Button type="button" size="sm" onClick={() => setAddWorkerDepartment(dept)} className="h-9"><Plus className="mr-1 h-4 w-4" />Add worker</Button>}
 </div>
 {(workers[dept.id] || []).length === 0 ? <p className="py-3 text-sm text-muted-foreground">No workers are registered in this department yet.</p> : (
 <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
 {(workers[dept.id] || []).map((worker) => (
 <div key={worker.id} className="rounded-lg border border-border p-3">
 <div className="font-medium">{worker.firstName} {worker.lastName}</div>
 <div className="text-xs text-muted-foreground">{worker.employeeCode} · {worker.email}</div>
 <div className="mt-1 text-xs">{worker.userAccounts?.some((account) => account.isActive) ? 'Login active' : 'No active login'} · {worker.status}</div>
 </div>
 ))}
 </div>
 )}
 </div>
 </TableCell>
 </TableRow>
 )}
 </React.Fragment>
 ))
 )}
 </TableBody>
 </Table>
 </div>
 <PaginationControls
 page={page}
 pageSize={pageSize}
 total={displayedDepartments.length}
 onPageChange={setPage}
 onPageSizeChange={updatePageSize}
 />
 </Card>
 <AddWorkerModal
 open={Boolean(addWorkerDepartment)}
 onClose={() => setAddWorkerDepartment(null)}
 departmentId={addWorkerDepartment?.id}
 departmentName={addWorkerDepartment?.name}
 onWorkerCreated={() => {
 if (addWorkerDepartment) void refreshWorkers(addWorkerDepartment.id);
 }}
 />

 <DepartmentDialog
 open={dialogOpen}
 onClose={() => {
 setDialogOpen(false);
 setEditingDept(null);
 }}
 departmentToEdit={editingDept}
 />

 <ConfirmDeleteDialog
 open={Boolean(departmentToDeactivate)}
 title="Deactivate department?"
 message={<>Deactivate <strong>{departmentToDeactivate?.name}</strong>? It will no longer appear as an active department, and its production history will be preserved.</>}
 error={deactivationError}
 isDeleting={isDeactivating}
 confirmText="Deactivate department"
 loadingText="Deactivating…"
 onClose={() => {
 if (isDeactivating) return;
 setDepartmentToDeactivate(null);
 setDeactivationError(null);
 }}
 onConfirm={() => void handleDeactivate()}
 />
 </>
 );
}
