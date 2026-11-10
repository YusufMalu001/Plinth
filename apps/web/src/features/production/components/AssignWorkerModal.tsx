'use client';

import React, { useState, useMemo } from 'react';
import { Dialog, Input, Button } from '@synergy/ui';
import { Users, UserPlus, Loader2, Building2, Check, CheckSquare, Square } from 'lucide-react';
import { fetchApi } from '@/features/api/client';
import { showToast } from '@/components/toast-store';
import { useQueryClient } from '@tanstack/react-query';
import { useAssignWorker } from '@/features/production/execution-hooks';

const SUPERVISOR_REGEX = /\b(head|incharge|in-charge|in_charge|manager|supervisor|admin|administrator|director)\b/i;

export const isDepartmentSupervisor = (
  emp: {
    firstName?: string;
    lastName?: string;
    designation?: string | null;
    role?: string | null;
  },
  departmentHead?: string | null
): boolean => {
  if (departmentHead) {
    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim().toLowerCase();
    if (fullName === departmentHead.trim().toLowerCase()) return true;
  }
  const text = `${emp.firstName || ''} ${emp.lastName || ''} ${emp.designation || ''} ${emp.role || ''}`.toLowerCase();
  return SUPERVISOR_REGEX.test(text);
};

export interface AssignWorkerModalProps {
  open: boolean;
  onClose: () => void;
  batchId: string;
  batchNumber: string;
  departmentId: string;
  departmentName?: string;
  departmentHead?: string | null;
  departmentEmployees: Array<{
    id: string;
    firstName: string;
    lastName: string;
    employeeCode?: string | null;
    designation?: string | null;
    role?: string | null;
  }>;
  assignedEmployeeIds?: string[];
  onAssigned?: () => void;
  customAssign?: (employeeId: string, subtaskDescription?: string) => Promise<void>;
}

export function AssignWorkerModal({
  open,
  onClose,
  batchId,
  batchNumber,
  departmentId,
  departmentName,
  departmentHead,
  departmentEmployees,
  assignedEmployeeIds = [],
  onAssigned,
  customAssign,
}: AssignWorkerModalProps) {
  const queryClient = useQueryClient();
  const assignWorkerMutation = useAssignWorker();

  // Active tab: 'existing' | 'new'
  const [activeTab, setActiveTab] = useState<'existing' | 'new'>('existing');

  // Multi-select state
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [subtask, setSubtask] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  // New worker creation state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('Shop Floor Operator');
  const [newWorkerSubtask, setNewWorkerSubtask] = useState('');
  const [isCreatingWorker, setIsCreatingWorker] = useState(false);

  // Filter out department heads / incharges / supervisors
  const assignableEmployees = useMemo(() => {
    return departmentEmployees.filter((emp) => !isDepartmentSupervisor(emp, departmentHead));
  }, [departmentEmployees, departmentHead]);

  // Unassigned operators that can be selected
  const availableEmployees = useMemo(() => {
    return assignableEmployees.filter((emp) => !assignedEmployeeIds.includes(emp.id));
  }, [assignableEmployees, assignedEmployeeIds]);

  // Selection toggle logic
  const toggleWorkerSelection = (workerId: string) => {
    if (assignedEmployeeIds.includes(workerId)) return;
    setSelectedWorkerIds((prev) =>
      prev.includes(workerId) ? prev.filter((id) => id !== workerId) : [...prev, workerId]
    );
  };

  const isAllAvailableSelected =
    availableEmployees.length > 0 &&
    availableEmployees.every((emp) => selectedWorkerIds.includes(emp.id));

  const handleToggleSelectAll = () => {
    if (isAllAvailableSelected) {
      setSelectedWorkerIds((prev) =>
        prev.filter((id) => !availableEmployees.some((emp) => emp.id === id))
      );
    } else {
      setSelectedWorkerIds((prev) => {
        const set = new Set([...prev, ...availableEmployees.map((emp) => emp.id)]);
        return Array.from(set);
      });
    }
  };

  const handleClose = () => {
    if (isCreatingWorker || isAssigning || assignWorkerMutation.isPending) return;
    setSelectedWorkerIds([]);
    setSubtask('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setDesignation('Shop Floor Operator');
    setNewWorkerSubtask('');
    setActiveTab('existing');
    onClose();
  };

  // Assign multiple selected existing workers
  const handleAssignExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedWorkerIds.length === 0) {
      showToast({ kind: 'error', title: 'Select Operator', message: 'Please select at least one operator to assign.' });
      return;
    }

    setIsAssigning(true);
    try {
      for (const workerId of selectedWorkerIds) {
        if (customAssign) {
          await customAssign(workerId, subtask.trim() || undefined);
        } else {
          await assignWorkerMutation.mutateAsync({
            batchId,
            employeeId: workerId,
            subtaskDescription: subtask.trim() || undefined,
          });
        }
      }

      const count = selectedWorkerIds.length;
      showToast({
        kind: 'success',
        title: count === 1 ? 'Worker Assigned' : 'Workers Assigned',
        message: `${count} ${count === 1 ? 'operator' : 'operators'} assigned to ${batchNumber}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['department-execution'] });
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] });
      queryClient.invalidateQueries({ queryKey: ['assembly-batch', batchId] });
      queryClient.invalidateQueries({ queryKey: ['assembly-batches'] });
      if (onAssigned) onAssigned();
      handleClose();
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Assignment Failed',
        message: err?.message || 'Could not assign worker(s) to batch.',
      });
    } finally {
      setIsAssigning(false);
    }
  };

  // Create new worker and assign immediately
  const handleCreateAndAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      showToast({
        kind: 'error',
        title: 'Name Required',
        message: 'Please provide both first and last name for the new worker.',
      });
      return;
    }

    if (!departmentId) {
      showToast({
        kind: 'error',
        title: 'Department Error',
        message: 'Department context is missing.',
      });
      return;
    }

    const cleanFirst = firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanLast = lastName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalEmail =
      email.trim() || `worker.${cleanFirst}.${cleanLast}.${Date.now().toString().slice(-4)}@company.internal`;

    setIsCreatingWorker(true);
    try {
      // 1. Invite/create employee
      const empRes = await fetchApi<any>('/employees/invite', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: finalEmail,
          phone: phone.trim() || undefined,
          role: 'shop_floor_operator',
          accessRoleKey: 'shop_floor_operator',
          departmentId,
          designation: designation.trim() || 'Shop Floor Operator',
        }),
      });

      const createdEmployee = empRes?.data?.employee || empRes?.employee || empRes?.data || empRes;
      const createdId = createdEmployee?.id || createdEmployee?.employeeId;

      if (!createdId) {
        throw new Error('Worker was created but ID was not returned.');
      }

      // 2. Assign worker to this execution batch
      if (customAssign) {
        await customAssign(createdId, newWorkerSubtask.trim() || undefined);
      } else {
        await assignWorkerMutation.mutateAsync({
          batchId,
          employeeId: createdId,
          subtaskDescription: newWorkerSubtask.trim() || undefined,
        });
      }

      showToast({
        kind: 'success',
        title: 'Worker Created & Assigned',
        message: `${firstName.trim()} ${lastName.trim()} was successfully added to ${departmentName || 'department'} and assigned to ${batchNumber}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['department-execution'] });
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] });
      queryClient.invalidateQueries({ queryKey: ['assembly-batch', batchId] });
      queryClient.invalidateQueries({ queryKey: ['assembly-batches'] });
      if (onAssigned) onAssigned();
      handleClose();
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Failed to Create & Assign',
        message: err?.message || 'Could not provision worker or assign to batch.',
      });
    } finally {
      setIsCreatingWorker(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Assign Department Operators"
      description={`Assign shop-floor operators to ${batchNumber} (${departmentName || 'Department'}).`}
      className="max-w-md"
    >
      <div className="space-y-4 pt-1">
        {/* Department Info Pill */}
        <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/80 bg-muted/20 text-xs">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">{departmentName || 'Workstation Department'}</span>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {availableEmployees.length} {availableEmployees.length === 1 ? 'Operator' : 'Operators'} Available
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border/80">
          <button
            type="button"
            onClick={() => setActiveTab('existing')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'existing'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Select Existing ({assignableEmployees.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'new'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>+ Add New Operator</span>
          </button>
        </div>

        {/* TAB 1: SELECT EXISTING OPERATORS (MULTI-SELECT) */}
        {activeTab === 'existing' && (
          <form onSubmit={handleAssignExisting} className="space-y-4">
            {assignableEmployees.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    Choose Operators <span className="text-destructive">*</span>
                  </label>
                  {availableEmployees.length > 0 && (
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                    >
                      {isAllAvailableSelected ? 'Deselect All' : 'Select All Available'}
                    </button>
                  )}
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-0.5">
                  {assignableEmployees.map((worker) => {
                    const isAlreadyAssigned = assignedEmployeeIds.includes(worker.id);
                    const isSelected = selectedWorkerIds.includes(worker.id);

                    return (
                      <div
                        key={worker.id}
                        onClick={() => toggleWorkerSelection(worker.id)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors select-none ${
                          isAlreadyAssigned
                            ? 'border-border/40 bg-muted/30 opacity-60 cursor-not-allowed text-muted-foreground'
                            : isSelected
                            ? 'border-primary bg-primary/5 text-foreground font-medium cursor-pointer'
                            : 'border-border/70 hover:border-border hover:bg-muted/10 text-foreground cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Multi-select indicator */}
                          <div className="shrink-0 text-muted-foreground">
                            {isAlreadyAssigned ? (
                              <CheckSquare className="h-4 w-4 text-muted-foreground/60" />
                            ) : isSelected ? (
                              <CheckSquare className="h-4 w-4 text-primary fill-primary/10" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground/50 hover:text-foreground" />
                            )}
                          </div>

                          <span
                            className={`h-7 w-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {(worker.firstName?.[0] || 'W').toUpperCase()}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-foreground truncate">
                                {worker.firstName} {worker.lastName}
                              </p>
                              {isAlreadyAssigned && (
                                <span className="text-[9px] bg-muted/80 px-1.5 py-0.5 rounded text-muted-foreground font-medium shrink-0">
                                  Already Assigned
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {worker.designation || worker.employeeCode || 'Operator'}
                            </p>
                          </div>
                        </div>

                        {isSelected && !isAlreadyAssigned && (
                          <div className="h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5 pt-0.5">
                  <span>
                    {selectedWorkerIds.length} of {availableEmployees.length} available selected
                  </span>
                  {assignedEmployeeIds.length > 0 && (
                    <span>{assignedEmployeeIds.length} already assigned</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-6 text-center space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/10 p-4">
                <Users className="h-8 w-8 mx-auto text-muted-foreground/60" />
                <p className="text-xs font-medium text-foreground">No active operators in this department</p>
                <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                  There are no shop-floor operators registered under {departmentName || 'this department'} yet. Supervisors and heads are excluded from operator assignments.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setActiveTab('new')}
                  className="mt-2 text-xs font-semibold"
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  Add Operator to Department
                </Button>
              </div>
            )}

            {assignableEmployees.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground block">
                  Subtask / Station Description (Optional)
                </label>
                <Input
                  value={subtask}
                  onChange={(e) => setSubtask(e.target.value)}
                  placeholder="e.g. Primary cutting & deburring, station #2"
                  className="text-xs"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
              <Button type="button" variant="outline" onClick={handleClose} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isAssigning ||
                  assignWorkerMutation.isPending ||
                  selectedWorkerIds.length === 0 ||
                  availableEmployees.length === 0
                }
                className="text-xs font-semibold"
              >
                {isAssigning || assignWorkerMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Assigning ({selectedWorkerIds.length})...
                  </>
                ) : selectedWorkerIds.length > 1 ? (
                  `Assign ${selectedWorkerIds.length} Operators`
                ) : (
                  'Assign Operator'
                )}
              </Button>
            </div>
          </form>
        )}

        {/* TAB 2: ADD NEW OPERATOR */}
        {activeTab === 'new' && (
          <form onSubmit={handleCreateAndAssign} className="space-y-3.5">
            <p className="text-xs text-muted-foreground">
              Add a new worker directly to <strong className="text-foreground">{departmentName || 'department'}</strong>.
              They will be automatically assigned to this batch.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  First Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Suresh"
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">
                  Last Name <span className="text-destructive">*</span>
                </label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Patil"
                  required
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Work Email <span className="text-[10px] text-muted-foreground font-normal">(Auto-generated if empty)</span>
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@company.com"
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Phone Number</label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground">Designation</label>
                <Input
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="Shop Floor Operator"
                  className="text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">
                Subtask / Station Description (Optional)
              </label>
              <Input
                value={newWorkerSubtask}
                onChange={(e) => setNewWorkerSubtask(e.target.value)}
                placeholder="e.g. CNC setup & execution"
                className="text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
              <Button type="button" variant="outline" onClick={handleClose} className="text-xs">
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreatingWorker || !firstName.trim() || !lastName.trim()}
                className="text-xs font-semibold"
              >
                {isCreatingWorker ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Creating &amp; Assigning...
                  </>
                ) : (
                  'Create & Assign'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
