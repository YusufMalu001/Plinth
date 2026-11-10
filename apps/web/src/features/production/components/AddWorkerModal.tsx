'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Dialog, Input, Button } from '@synergy/ui';
import { UserPlus, User, Mail, Phone, Briefcase, Loader2, Building2 } from 'lucide-react';
import { fetchApi } from '@/features/api/client';
import { showToast } from '@/components/toast-store';
import { useQueryClient } from '@tanstack/react-query';
import { useDepartments, type Department } from '@/hooks/useMasterData';

export interface AddWorkerModalProps {
  open: boolean;
  onClose: () => void;
  departmentId?: string;
  departmentName?: string;
  onWorkerCreated?: (worker: { id: string; firstName: string; lastName: string; employeeCode?: string }) => void;
}

export function AddWorkerModal({
  open,
  onClose,
  departmentId,
  departmentName,
  onWorkerCreated,
}: AddWorkerModalProps) {
  const queryClient = useQueryClient();
  const { data: deptsData } = useDepartments('ACTIVE');
  const departments = useMemo(() => (deptsData?.items || []) as Department[], [deptsData?.items]);

  const [localDepartmentId, setLocalDepartmentId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('Shop Floor Operator');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeDeptId = departmentId || localDepartmentId || (departments[0]?.id ?? '');
  const activeDeptName = departmentName || departments.find(d => d.id === activeDeptId)?.name || 'Selected Department';

  const handleClose = () => {
    if (isSubmitting) return;
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setDesignation('Shop Floor Operator');
    setLocalDepartmentId('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      showToast({
        kind: 'error',
        title: 'Name Required',
        message: 'Please provide both first and last name for the worker.'
      });
      return;
    }

    if (!activeDeptId) {
      showToast({
        kind: 'error',
        title: 'Department Required',
        message: 'Please select a target department for this worker.'
      });
      return;
    }

    // Auto-generate internal work email if omitted
    const cleanFirst = firstName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanLast = lastName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalEmail = email.trim() || `worker.${cleanFirst}.${cleanLast}.${Date.now().toString().slice(-4)}@company.internal`;

    setIsSubmitting(true);
    try {
      const response = await fetchApi<any>('/employees/invite', {
        method: 'POST',
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: finalEmail,
          phone: phone.trim() || undefined,
          role: 'shop_floor_operator',
          accessRoleKey: 'shop_floor_operator',
          departmentId: activeDeptId,
          designation: designation.trim() || 'Shop Floor Operator'
        })
      });

      const createdPayload = response?.data || response;
      showToast({
        kind: 'success',
        title: 'Worker Created',
        message: createdPayload?.tempPassword
          ? `${firstName.trim()} ${lastName.trim()} was added to ${activeDeptName} and linked to the HR employee profile. Login: ${finalEmail} · Temporary password: ${createdPayload.tempPassword} (must be changed at first sign-in).`
          : `Worker ${firstName.trim()} ${lastName.trim()} was added to ${activeDeptName} and linked to the HR employee profile. Login: ${finalEmail}.`
      });

      // Invalidate relevant queries so worker immediately appears in assignments
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['department-execution'] });
      queryClient.invalidateQueries({ queryKey: ['assembly-batches'] });

      const createdEmployee = createdPayload?.employee || createdPayload;
      if (onWorkerCreated) {
        onWorkerCreated({
          id: createdEmployee.id || createdEmployee.employeeId,
          firstName: createdEmployee.firstName || firstName.trim(),
          lastName: createdEmployee.lastName || lastName.trim(),
          employeeCode: createdEmployee.employeeCode
        });
      }

      handleClose();
    } catch (err: any) {
      showToast({
        kind: 'error',
        title: 'Failed to Add Worker',
        message: err?.message || 'Could not provision worker account.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Add Department Worker"
      description={`Add a new shop-floor operator for ${activeDeptName ? `the ${activeDeptName} department` : 'this department'}.`}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {!departmentId && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Target Department <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={activeDeptId}
                onChange={(e) => setLocalDepartmentId(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                disabled={isSubmitting}
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              First Name <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="pl-8 text-xs"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Last Name <span className="text-destructive">*</span>
            </label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              className="text-xs"
              required
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Work Email</span>
            <span className="text-[10px] text-muted-foreground font-normal">Optional (auto-generated if empty)</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. operator@company.com"
              className="pl-8 text-xs"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Phone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contact number"
                className="pl-8 text-xs"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Designation</label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Role / Title"
                className="pl-8 text-xs"
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
          Assigned to: <strong className="text-foreground">{activeDeptName}</strong> with role <span className="font-mono text-primary font-medium">shop_floor_operator</span>.
          <div className="mt-1.5">
            Worker details and onboarding are saved in HR.{' '}
            <Link href="/hr/directory" className="font-semibold text-primary underline-offset-2 hover:underline">
              Open Employee Directory
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="text-xs font-semibold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Adding...
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Add Worker
              </>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
