'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, Input, Button } from '@synergy/ui';
import { Building2, User, Plus, Save, Mail, KeyRound, Phone } from 'lucide-react';
import { useCreateDepartment, useUpdateDepartment, type Department } from '../hooks/useMasterData';
import { showToast } from './toast-store';
import { apiClient } from '@/lib/api-client';

export interface DepartmentDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (department: Department) => void;
  departmentToEdit?: Department | null;
  departmentCodePrefix?: string;
}

export function DepartmentDialog({
  open,
  onClose,
  onCreated,
  departmentToEdit,
  departmentCodePrefix,
}: DepartmentDialogProps) {
  const isEditing = Boolean(departmentToEdit?.id);
  const [name, setName] = useState('');
  const [departmentHead, setDepartmentHead] = useState('');
  const [headEmail, setHeadEmail] = useState('');
  const [headPhone, setHeadPhone] = useState('');
  const [headPassword, setHeadPassword] = useState('');
  const [description, setDescription] = useState('');
  const [isAssembly, setIsAssembly] = useState(false);
  const [departmentPendingHeadSetup, setDepartmentPendingHeadSetup] = useState<Department | null>(null);
  const [isCreatingHead, setIsCreatingHead] = useState(false);

  const createDepartment = useCreateDepartment();
  const updateDepartment = useUpdateDepartment();
  const isPending = createDepartment.isPending || updateDepartment.isPending || isCreatingHead;

  useEffect(() => {
    if (open) {
      if (departmentToEdit) {
        setName(departmentToEdit.name || '');
        setDepartmentHead(departmentToEdit.departmentHead || '');
        setHeadEmail('');
        setHeadPhone('');
        setHeadPassword('');
        setDescription(departmentToEdit.description || '');
        setIsAssembly(Boolean(departmentToEdit.isAssembly));
      } else if (!departmentPendingHeadSetup) {
        setName('');
        setDepartmentHead('');
        setHeadEmail('');
        setHeadPhone('');
        setHeadPassword('');
        setDescription('');
        setIsAssembly(false);
      }
    }
  }, [open, departmentToEdit, departmentPendingHeadSetup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast({ kind: 'error', title: 'Department Name required', message: 'Please enter a department name.' });
      return;
    }
    if (!isEditing && (!departmentHead.trim() || !headEmail.trim() || headPassword.length < 8)) {
      showToast({ kind: 'error', title: 'Department head login required', message: 'Enter the head’s full name, login email, and a temporary password of at least 8 characters.' });
      return;
    }
    try {
      if (isEditing && departmentToEdit) {
        const updated = await updateDepartment.mutateAsync({
          id: departmentToEdit.id,
          name: name.trim(),
          departmentHead: departmentHead.trim() || null,
          description: description.trim() || undefined,
          isAssembly,
        });
        showToast({ kind: 'success', title: 'Department updated', message: `Department "${updated.name}" has been updated.` });
        if (onCreated) onCreated(updated);
      } else {
        let created = departmentPendingHeadSetup;
        if (!created) {
          const code = departmentCodePrefix
            ? `${departmentCodePrefix}-${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)}-${Date.now().toString(36).toUpperCase()}`
            : undefined;
          created = await createDepartment.mutateAsync({
            name: name.trim(),
            ...(code ? { code } : {}),
            ...(departmentHead.trim() ? { departmentHead: departmentHead.trim() } : {}),
            description: description.trim() || undefined,
            isAssembly,
          });
          setDepartmentPendingHeadSetup(created);
        }
        setIsCreatingHead(true);
        try {
          await apiClient.post('/employees/invite', {
            firstName: departmentHead.trim().split(/\s+/)[0],
            lastName: departmentHead.trim().split(/\s+/).slice(1).join(' ') || '-',
            email: headEmail.trim().toLowerCase(),
            phone: headPhone.trim() || undefined,
            role: 'Department Head',
            designation: 'Department Head',
            departmentId: created.id,
            accessRoleKey: 'department_incharge',
            tempPassword: headPassword,
          });
          showToast({ kind: 'success', title: 'Department and head login created', message: `${created.name} is ready. ${headEmail.trim().toLowerCase()} can sign in with the temporary password you set and will be asked to change it.` });
          setDepartmentPendingHeadSetup(null);
        } catch (accountError) {
          const reason = accountError instanceof Error ? accountError.message : 'Please retry head account setup from HR.';
          throw new Error(`Department "${created.name}" was created. Correct the head login details and submit again to finish setup: ${reason}`);
        } finally {
          setIsCreatingHead(false);
        }
        if (onCreated) onCreated(created);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to save department.';
      showToast({ kind: 'error', title: 'Failed to save department', message: msg });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit Department' : 'Create New Department'}
      description={departmentPendingHeadSetup
        ? `Department "${departmentPendingHeadSetup.name}" is saved. Finish creating its head login below.`
        :
        isEditing
          ? 'Update the department details, head of department, and operational scope.'
          : 'Add a new production or shop floor department with an assigned department head.'
      }
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {/* Department Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Department Name <span className="text-destructive font-bold">*</span></span>
          </label>
          <Input
            icon={Building2}
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Laser Cutting / CNC Shop"
            disabled={Boolean(departmentPendingHeadSetup)}
            className="text-xs sm:text-sm font-medium"
          />
        </div>

        {/* Assembly Department Selector Checkbox */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3 transition-colors hover:bg-muted/40">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              id="isAssemblyDeptCheckbox"
              checked={isAssembly}
              onChange={(e) => setIsAssembly(e.target.checked)}
              disabled={Boolean(departmentPendingHeadSetup)}
              className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
            />
            <div className="space-y-0.5 select-none">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">Assembly Department</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Convergence Station
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Check this if this department serves as the final assembly & convergence gate. It will be identified in route creation and given assembly-specific access.
              </p>
            </div>
          </label>
        </div>

        {/* Department head employee and login */}
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="text-xs font-bold text-foreground">Department Head & Login</div>
          <Input icon={User} required={!isEditing} value={departmentHead} onChange={(e) => setDepartmentHead(e.target.value)} placeholder="Head’s full name" className="text-xs sm:text-sm font-medium" disabled={isEditing || Boolean(departmentPendingHeadSetup)} />
          {!isEditing && <>
            <Input icon={Mail} type="email" required value={headEmail} onChange={(e) => setHeadEmail(e.target.value)} placeholder="Login email" className="text-xs sm:text-sm font-medium" />
            <Input icon={Phone} type="tel" value={headPhone} onChange={(e) => setHeadPhone(e.target.value)} placeholder="Phone (optional)" className="text-xs sm:text-sm font-medium" />
            <Input icon={KeyRound} type="password" required minLength={8} autoComplete="new-password" value={headPassword} onChange={(e) => setHeadPassword(e.target.value)} placeholder="Temporary password (8+ characters)" className="text-xs sm:text-sm font-medium" />
            <p className="text-[11px] text-muted-foreground">This creates an employee profile and department-scoped login. They’ll change this password at first sign-in.</p>
          </>}
          {isEditing && <p className="text-[11px] text-muted-foreground">The department head is a linked employee account. Update their details from the employee profile to keep the roster and login consistent.</p>}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground flex items-center justify-between">
            <span>Description</span>
            <span className="text-[10px] text-muted-foreground font-normal">Optional</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief scope, operation notes, or machinery details..."
            rows={3}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/80">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg text-xs font-semibold"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            size="sm"
            loading={isPending}
            className="rounded-lg bg-primary text-primary-foreground text-xs font-semibold shadow-xs"
            icon={isEditing ? Save : Plus}
          >
            {isEditing ? 'Save Changes' : departmentPendingHeadSetup ? 'Finish Head Login' : 'Create Department'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
