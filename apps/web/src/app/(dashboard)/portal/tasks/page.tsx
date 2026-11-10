'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/features/auth/hooks';
import { useTasks } from '@/features/hr/hooks';
import { hrApi } from '@/features/hr/api';
import { EmployeeTaskDto, TaskPriorityType } from '@synergy/types';
import {
  CheckSquare,
  Clock,
  AlertCircle,
  Upload,
  ArrowRight,
  Filter,
  CheckCircle2,
  Calendar,
  Building2,
  Eye,
  Sparkles,
  Flame
} from 'lucide-react';
import { Button, Dialog } from '@synergy/ui';

export default function EmployeeTasksPortalPage() {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const employeeId = currentUser?.employeeRefId || currentUser?.employeeId || currentUser?.id;

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterPriority, setFilterPriority] = useState<string>('ALL');

  const { tasks, loading, error, refetch } = useTasks({
    employeeId: employeeId || undefined
  });

  // Selected task for completion modal
  const [selectedTask, setSelectedTask] = useState<EmployeeTaskDto | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Form submission state
  const [proofForm, setProofForm] = useState({
    proofUrl: '',
    proofFileName: '',
    proofNotes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Filter tasks
  const filteredTasks = tasks.filter((t: EmployeeTaskDto) => {
    if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
    if (filterPriority !== 'ALL' && t.priority !== filterPriority) return false;
    return true;
  });

  // Sort tasks by priority and due date
  const priorityWeight: Record<TaskPriorityType, number> = {
    URGENT: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
  };

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // Priority first
    const weightA = priorityWeight[a.priority as TaskPriorityType] || 0;
    const weightB = priorityWeight[b.priority as TaskPriorityType] || 0;
    if (weightA !== weightB) return weightB - weightA;

    // Then due date
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Counts
  const urgentCount = tasks.filter((t: EmployeeTaskDto) => t.priority === 'URGENT' && t.status !== 'COMPLETED').length;
  const pendingCount = tasks.filter((t: EmployeeTaskDto) => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
  const underReviewCount = tasks.filter((t: EmployeeTaskDto) => t.status === 'UNDER_REVIEW').length;
  const completedCount = tasks.filter((t: EmployeeTaskDto) => t.status === 'COMPLETED').length;

  const handleStartTask = async (task: EmployeeTaskDto) => {
    try {
      await hrApi.updateTask(task.id, { status: 'IN_PROGRESS' });
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to start task');
    }
  };

  const handleOpenSubmitModal = (task: EmployeeTaskDto) => {
    setSelectedTask(task);
    setProofForm({
      proofUrl: task.proofUrl || '',
      proofFileName: task.proofFileName || '',
      proofNotes: task.proofNotes || ''
    });
    setIsSubmitModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setProofForm((prev) => ({
        ...prev,
        proofUrl: dataUrl,
        proofFileName: file.name
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    if (!proofForm.proofUrl && !proofForm.proofNotes.trim()) {
      alert('Please upload a proof file or provide completion notes.');
      return;
    }

    setSubmitting(true);
    try {
      await hrApi.updateTask(selectedTask.id, {
        status: 'UNDER_REVIEW',
        proofUrl: proofForm.proofUrl || undefined,
        proofFileName: proofForm.proofFileName || undefined,
        proofNotes: proofForm.proofNotes || undefined
      });
      setIsSubmitModalOpen(false);
      setSelectedTask(null);
      refetch();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to submit proof');
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
        {priority === 'URGENT' && <Flame className="w-3 h-3 text-destructive" />}
        {priority}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-primary text-primary-foreground shadow-xs">
            <Clock className="w-3.5 h-3.5" />
            Under HR Validation
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-foreground border border-border">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
            Completed & Validated
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            In Progress
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-destructive/10 text-destructive border border-destructive/30">
            <AlertCircle className="w-3.5 h-3.5" />
            Revision Required
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            Pending Start
          </span>
        );
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header Banner */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary bg-primary/10 px-2 py-0.5 rounded-md">
              Employee Portal
            </span>
            <span className="text-xs text-muted-foreground">· Assigned Tasks & Work Orders</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            My Assigned Tasks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Execute tasks prioritized by urgency. When completed, submit your proof of work for HR/Admin validation.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <Link href="/attendance">
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>My Attendance</span>
            </Button>
          </Link>
          <Link href="/hr/tasks">
            <Button variant="outline" size="sm" className="gap-2">
              <CheckSquare className="w-4 h-4 text-muted-foreground" />
              <span>HR Task Queue</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Urgent Actions</span>
            <Flame className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{urgentCount}</span>
            <span className="text-[11px] text-muted-foreground">Require top priority</span>
          </div>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Pending / Active</span>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{pendingCount}</span>
            <span className="text-[11px] text-muted-foreground">To be executed</span>
          </div>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Under Validation</span>
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{underReviewCount}</span>
            <span className="text-[11px] text-muted-foreground">Proof submitted</span>
          </div>
        </div>

        <div className="bg-card p-4 rounded-2xl border border-border shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Validated Completed</span>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{completedCount}</span>
            <span className="text-[11px] text-muted-foreground">Verified by HR</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-card p-4 rounded-2xl border border-border shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              filterStatus === 'ALL'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setFilterStatus('PENDING')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              filterStatus === 'PENDING'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilterStatus('IN_PROGRESS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              filterStatus === 'IN_PROGRESS'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            In Progress
          </button>
          <button
            onClick={() => setFilterStatus('UNDER_REVIEW')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              filterStatus === 'UNDER_REVIEW'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Under Review ({underReviewCount})
          </button>
          <button
            onClick={() => setFilterStatus('COMPLETED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
              filterStatus === 'COMPLETED'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Completed ({completedCount})
          </button>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="w-full md:w-44 px-3 py-1.5 text-xs rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="ALL">All Priorities</option>
            <option value="URGENT">🚨 Urgent Only</option>
            <option value="HIGH">⚡ High Only</option>
            <option value="MEDIUM">Medium Only</option>
            <option value="LOW">Low Only</option>
          </select>
        </div>
      </div>

      {/* Task List Cards */}
      <div className="space-y-4">
        {loading || userLoading ? (
          <div className="bg-card p-12 rounded-2xl border border-border text-center text-muted-foreground">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm font-medium">Loading assigned tasks...</p>
          </div>
        ) : error ? (
          <div className="bg-card p-8 rounded-2xl border border-destructive/30 text-center text-destructive">
            <AlertCircle className="w-8 h-8 mx-auto mb-2" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : sortedTasks.length === 0 ? (
          <div className="bg-card p-12 rounded-2xl border border-border text-center text-muted-foreground">
            <CheckSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground/60" />
            <h3 className="text-base font-semibold text-foreground">No tasks matching criteria</h3>
            <p className="text-xs text-muted-foreground mt-1">You currently have no tasks assigned with this filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {sortedTasks.map((task: EmployeeTaskDto) => (
              <div
                key={task.id}
                className="bg-card rounded-2xl border border-border p-5 transition-all hover:shadow-md"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Task Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {getPriorityBadge(task.priority)}
                      {getStatusBadge(task.status)}
                      {task.department && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-0.5 rounded-md font-medium">
                          <Building2 className="w-3.5 h-3.5" />
                          {task.department}
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-foreground">{task.title}</h3>
                      {task.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                      {task.dueDate && (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                          <Calendar className="w-3.5 h-3.5 text-primary" />
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      <span>Assigned: {new Date(task.createdAt).toLocaleDateString()}</span>
                      {task.completedAt && (
                        <span className="text-muted-foreground font-semibold">
                          Validated At: {new Date(task.completedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Revision notes if rejected */}
                    {task.status === 'REJECTED' && task.validationNotes && (
                      <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive flex items-start gap-2 mt-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block font-bold">HR Rejection Reason:</strong>
                          <span>{task.validationNotes}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2.5 shrink-0 flex-wrap lg:flex-col lg:items-end justify-end pt-3 lg:pt-0 border-t lg:border-t-0 border-border">
                    <Link href={`/portal/tasks/${task.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Task Details</span>
                      </Button>
                    </Link>

                    {task.status === 'PENDING' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleStartTask(task)}
                        className="gap-1.5 text-xs"
                      >
                        <span>Start Working</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    )}

                    {(task.status === 'IN_PROGRESS' || task.status === 'REJECTED' || task.status === 'PENDING') && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenSubmitModal(task)}
                        className="gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{task.status === 'REJECTED' ? 'Re-upload Proof' : 'Upload Proof & Complete'}</span>
                      </Button>
                    )}

                    {task.status === 'UNDER_REVIEW' && (
                      <div className="text-right">
                        <span className="text-xs font-semibold text-foreground block">
                          Proof Uploaded
                        </span>
                        <span className="text-[11px] text-muted-foreground">Awaiting Admin Sign-off</span>
                      </div>
                    )}

                    {task.status === 'COMPLETED' && (
                      <span className="text-xs font-bold text-foreground flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        Verified Complete
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completion & Proof Upload Modal */}
      <Dialog
        open={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Submit Task Proof of Completion"
        description="Attach completion evidence, photographs, test reports, or logs for HR/Admin validation."
        className="max-w-lg"
      >
        <form onSubmit={handleSubmitProof} className="space-y-4 text-xs">
          {selectedTask && (
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border space-y-1">
              <span className="text-[10px] font-bold uppercase text-primary tracking-wider">
                Target Task
              </span>
              <h4 className="text-sm font-bold text-foreground">{selectedTask.title}</h4>
              <p className="text-xs text-muted-foreground">{selectedTask.description || 'No detailed description provided.'}</p>
              <div className="pt-1 flex items-center gap-2">
                {getPriorityBadge(selectedTask.priority)}
                {selectedTask.dueDate && (
                  <span className="text-xs text-muted-foreground font-medium">
                    Due: {new Date(selectedTask.dueDate).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="font-semibold text-foreground block mb-1.5">
              Upload Proof of Completion (Image, PDF, Document) *
            </label>
            <div className="border border-dashed border-border rounded-xl p-4 text-center hover:bg-muted/30 transition-colors">
              <input
                type="file"
                id="task-proof-file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.txt"
                onChange={handleFileUpload}
              />
              <label
                htmlFor="task-proof-file"
                className="cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-foreground">Click to upload proof file</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Supports PNG, JPG, PDF, DOCX up to 10MB</p>
                </div>
              </label>

              {proofForm.proofFileName && (
                <div className="mt-3 p-2 bg-primary/10 rounded-lg text-primary text-xs font-semibold flex items-center justify-between">
                  <span className="truncate max-w-[280px]">{proofForm.proofFileName}</span>
                  <span className="text-[10px] uppercase font-bold text-emerald-600">Attached ✓</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="font-semibold text-foreground block mb-1.5">Completion Notes / Work Description</label>
            <textarea
              rows={3}
              value={proofForm.proofNotes}
              onChange={(e) => setProofForm({ ...proofForm, proofNotes: e.target.value })}
              placeholder="Describe work completed, metrics, calibration values, or batch details..."
              className="w-full px-3 py-2 border border-border rounded-xl bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsSubmitModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={submitting}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            >
              {submitting ? 'Submitting...' : 'Submit for HR Validation'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
