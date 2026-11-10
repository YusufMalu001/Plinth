'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTasks, useEmployees } from '@/features/hr/hooks';
import { useDepartments } from '@/hooks/useMasterData';
import { useCurrentUser } from '@/features/auth/hooks';
import { hrApi } from '@/features/hr/api';
import { EmployeeTaskDto, EmployeeDto, TaskPriorityType } from '@synergy/types';
import {
  Briefcase,
  Search,
  Plus,
  Clock,
  CheckCircle2,
  Trash2,
  Eye,
  FileText,
  Check,
  XCircle,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { Button, Card, Dialog, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@synergy/ui';
import { DepartmentDialog } from '@/components/DepartmentDialog';

export default function TaskQueuePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  // HR Validation Modal State
  const [validatingTask, setValidatingTask] = useState<EmployeeTaskDto | null>(null);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [validationAction, setValidationAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [validationNotes, setValidationNotes] = useState('');
  const [isProcessingValidation, setIsProcessingValidation] = useState(false);

  const { data: currentUser } = useCurrentUser();

  const { tasks, loading, error, refetch } = useTasks({
    search: searchTerm || undefined,
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    department: departmentFilter || undefined
  });

  const { employees } = useEmployees();
  const { data: departmentsData } = useDepartments('ACTIVE');
  const departments = departmentsData?.items || [];
  const [createDeptOpen, setCreateDeptOpen] = useState(false);

  const [newTaskForm, setNewTaskForm] = useState<{
    employeeId: string;
    title: string;
    description: string;
    department: string;
    priority: TaskPriorityType;
    dueDate: string;
  }>({
    employeeId: '',
    title: '',
    description: '',
    department: '',
    priority: 'MEDIUM',
    dueDate: ''
  });

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await hrApi.createTask({
        employeeId: newTaskForm.employeeId,
        title: newTaskForm.title,
        description: newTaskForm.description,
        department: newTaskForm.department,
        priority: newTaskForm.priority,
        dueDate: newTaskForm.dueDate || undefined
      });
      setIsNewTaskModalOpen(false);
      setNewTaskForm({
        employeeId: '',
        title: '',
        description: '',
        department: '',
        priority: 'MEDIUM',
        dueDate: ''
      });
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create task');
    }
  };


  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await hrApi.deleteTask(taskId);
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const handleValidateSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatingTask) return;
    setIsProcessingValidation(true);
    try {
      const isApprove = validationAction === 'APPROVE';
      await hrApi.updateTask(validatingTask.id, {
        status: isApprove ? 'COMPLETED' : 'REJECTED',
        validatedBy: currentUser?.name || currentUser?.email || 'HR Admin',
        validationNotes: validationNotes || (isApprove ? 'Task validated and approved.' : 'Proof rejected.')
      });
      setIsValidationModalOpen(false);
      setValidatingTask(null);
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to validate task');
    } finally {
      setIsProcessingValidation(false);
    }
  };

  const completedCount = tasks.filter((t: EmployeeTaskDto) => t.status === 'COMPLETED').length;
  const underReviewCount = tasks.filter((t: EmployeeTaskDto) => t.status === 'UNDER_REVIEW').length;
  const inProgressCount = tasks.filter((t: EmployeeTaskDto) => t.status === 'IN_PROGRESS').length;
  const pendingCount = tasks.filter((t: EmployeeTaskDto) => t.status === 'PENDING').length;

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary bg-primary/10 px-2 py-0.5 rounded-md">
              Human Resources
            </span>
            <span className="text-xs text-muted-foreground">· Task Queue & Validation</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Workforce Task Queue & Proof Validation
          </h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsNewTaskModalOpen(true)}
            className="gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Assign New Task</span>
          </Button>
        </div>
      </header>
      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pending Start</span>
            <div className="text-2xl sm:text-3xl font-black text-foreground">{pendingCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">In Progress</span>
            <div className="text-2xl sm:text-3xl font-black text-foreground">{inProgressCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Proof Submitted</span>
            <div className="text-2xl sm:text-3xl font-black text-foreground">{underReviewCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Validated Completed</span>
            <div className="text-2xl sm:text-3xl font-black text-foreground">{completedCount}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card p-5 rounded-2xl border border-border shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks, descriptions, employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="UNDER_REVIEW">Proof Under Review</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Revision Required</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">All Priorities</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>

          <div>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Task Queue Table */}
      <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm font-medium">Loading tasks queue...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Briefcase className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
            <h3 className="text-base font-semibold text-foreground">No tasks in queue</h3>
            <p className="text-xs text-muted-foreground mt-1">Assign a new task to any employee across departments.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold w-[28%]">Task</TableHead>
                  <TableHead className="font-bold w-[18%]">Assigned Employee</TableHead>
                  <TableHead className="font-bold w-[12%]">Department</TableHead>
                  <TableHead className="font-bold w-[10%]">Priority</TableHead>
                  <TableHead className="font-bold w-[10%]">Due Date</TableHead>
                  <TableHead className="font-bold w-[12%]">Status & Validation</TableHead>
                  <TableHead className="font-bold w-[10%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task: EmployeeTaskDto) => {
                  const hasProof = Boolean(task.proofUrl || task.proofNotes || task.proofFileName);
                  return (
                    <TableRow key={task.id} className="transition-colors hover:bg-muted/40">
                      <TableCell>
                        <Link
                          href={`/hr/tasks/${task.id}`}
                          className="group block"
                        >
                          <div className="font-semibold text-foreground text-xs group-hover:text-primary transition-colors">
                            {task.title}
                          </div>
                          {task.description && (
                            <div className="text-[11px] text-muted-foreground max-w-sm truncate">
                              {task.description}
                            </div>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {task.employee ? (
                          <Link
                            href={`/hr/employees/${task.employeeId}`}
                            className="flex items-center gap-2 text-foreground hover:text-primary transition-colors text-xs font-semibold"
                          >
                            <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                              {task.employee.firstName?.[0]}{task.employee.lastName?.[0]}
                            </div>
                            <span>{task.employee.firstName} {task.employee.lastName}</span>
                            <span className="text-muted-foreground font-mono text-[11px]">({task.employee.employeeCode})</span>
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {task.department || task.employee?.department?.name || 'General'}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                          {task.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                      </TableCell>

                      <TableCell>
                        {hasProof ? (
                          <button
                            onClick={() => {
                              setValidatingTask(task);
                              setValidationAction(task.status === 'REJECTED' ? 'REJECT' : 'APPROVE');
                              setValidationNotes(task.validationNotes || '');
                              setIsValidationModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-xs"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Review Proof</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            Task Incomplete
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/hr/tasks/${task.id}`}
                            className="text-muted-foreground hover:text-primary p-1 transition-colors cursor-pointer"
                            title="View Task Details & Status"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-muted-foreground hover:text-destructive p-1 transition-colors cursor-pointer"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* New Task Dialog */}
      <Dialog
        open={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        title="Assign New Task"
        description="Allocate task responsibilities across employees and define priority deadlines."
        className="max-w-lg"
      >
        <form onSubmit={handleCreateTask} className="space-y-4 text-xs">
          <div>
            <label className="font-semibold text-foreground block mb-1">Assign to Employee *</label>
            <select
              required
              value={newTaskForm.employeeId}
              onChange={(e) => {
                const selectedEmp = employees.find((emp: EmployeeDto) => emp.id === e.target.value);
                setNewTaskForm({
                  ...newTaskForm,
                  employeeId: e.target.value,
                  department: selectedEmp?.department?.name || ''
                });
              }}
              className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select Employee</option>
              {employees.map((emp: EmployeeDto) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeCode}) — {emp.designation || emp.role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">Task Title *</label>
            <input
              type="text"
              required
              value={newTaskForm.title}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
              placeholder="e.g. Calibrate Station 4 Sensors"
              className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">Description</label>
            <textarea
              value={newTaskForm.description}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-foreground block">Department</label>
                <button
                  type="button"
                  onClick={() => setCreateDeptOpen(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  title="Add new department"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add new</span>
                </button>
              </div>
              <select
                value={newTaskForm.department}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, department: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">Select Department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1">Priority</label>
              <select
                value={newTaskForm.priority}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, priority: e.target.value as TaskPriorityType })}
                className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1">Due Date</label>
            <input
              type="date"
              value={newTaskForm.dueDate}
              onChange={(e) => setNewTaskForm({ ...newTaskForm, dueDate: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setIsNewTaskModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
            >
              Create Task
            </Button>
          </div>
        </form>
      </Dialog>

      {/* HR Review & Validation Dialog */}
      <Dialog
        open={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
        title="Review Proof & Validate Task Completion"
        description="Inspect submitted work proof before approving task as completed or requesting revisions."
        className="max-w-lg"
      >
        {validatingTask && (
          <form data-keyboard-submit="off" onSubmit={handleValidateSubmission} className="space-y-4 text-xs">
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-primary tracking-wider">
                  Employee Submission
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {validatingTask.submittedAt ? new Date(validatingTask.submittedAt).toLocaleString() : ''}
                </span>
              </div>
              <h4 className="text-sm font-bold text-foreground">{validatingTask.title}</h4>
              <p className="text-xs text-muted-foreground">
                <strong>Worker:</strong> {validatingTask.employee?.firstName} {validatingTask.employee?.lastName} ({validatingTask.employee?.employeeCode})
              </p>
              {validatingTask.proofNotes && (
                <div className="mt-2 p-2.5 bg-background rounded-lg border border-border text-foreground">
                  <strong>Notes:</strong> {validatingTask.proofNotes}
                </div>
              )}
            </div>

            {/* Proof Attachment Preview */}
            {validatingTask.proofUrl && (
              <div className="p-3 bg-card rounded-xl border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground text-xs">
                      {validatingTask.proofFileName || 'Attached Proof Document'}
                    </span>
                  </div>
                  <a
                    href={validatingTask.proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open
                  </a>
                </div>

                <div className="rounded-lg border border-border/80 bg-muted/20 p-2 max-h-[220px] flex items-center justify-center overflow-hidden">
                  {validatingTask.proofUrl.startsWith('data:image') || /\.(png|jpe?g|webp|gif|svg)$/i.test(validatingTask.proofFileName || '') ? (
                    <img
                      src={validatingTask.proofUrl}
                      alt="Proof Preview"
                      className="max-h-[200px] max-w-full object-contain rounded"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <FileText className="w-8 h-8 text-primary mx-auto opacity-70 mb-1" />
                      <p className="text-xs text-muted-foreground font-medium">Document attached. Click Open to view.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Validation Decision Selector */}
            <div>
              <label className="font-semibold text-foreground block mb-1.5">Validation Decision *</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setValidationAction('APPROVE')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    validationAction === 'APPROVE'
                      ? 'border-primary bg-primary/10 text-foreground font-bold ring-2 ring-primary/20'
                      : 'border-border bg-card text-foreground hover:bg-muted/40 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Check className="w-4 h-4 text-primary" />
                    <span>Approve & Complete</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Mark task officially closed</p>
                </button>

                <button
                  type="button"
                  onClick={() => setValidationAction('REJECT')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    validationAction === 'REJECT'
                      ? 'border-destructive bg-destructive/10 text-foreground font-bold ring-2 ring-destructive/20'
                      : 'border-border bg-card text-foreground hover:bg-muted/40 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <XCircle className="w-4 h-4 text-destructive" />
                    <span>Reject & Request Revision</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Ask employee to re-upload</p>
                </button>
              </div>
            </div>
            <div>
              <label className="font-semibold text-foreground block mb-1.5">
                {validationAction === 'APPROVE' ? 'Sign-Off Remarks (Optional)' : 'Rejection Reason / Guidance *'}
              </label>
              <textarea
                rows={2}
                required={validationAction === 'REJECT'}
                value={validationNotes}
                onChange={(e) => setValidationNotes(e.target.value)}
                placeholder={
                  validationAction === 'APPROVE'
                    ? 'e.g. Work confirmed verified against QA specifications.'
                    : 'e.g. Missing inspection checklist signature. Please re-upload signed document.'
                }
                className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsValidationModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isProcessingValidation}
                className={
                  validationAction === 'APPROVE'
                    ? 'gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold'
                    : 'gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold'
                }
              >
                {isProcessingValidation
                  ? 'Saving...'
                  : validationAction === 'APPROVE'
                  ? 'Sign-Off & Complete Task'
                  : 'Reject Proof'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
      <DepartmentDialog
        open={createDeptOpen}
        onClose={() => setCreateDeptOpen(false)}
        onCreated={(newDept) => setNewTaskForm((prev) => ({ ...prev, department: newDept.name }))}
      />
    </div>
  );
}
