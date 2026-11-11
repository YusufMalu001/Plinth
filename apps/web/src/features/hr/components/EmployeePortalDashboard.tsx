'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCurrentUser } from '@/features/auth/hooks';
import { hrApi } from '@/features/hr/api';
import { EmployeeTaskDto } from '@plinth/types';
import { useProductionSchedules } from '@/features/production/execution-hooks';
import {
  Briefcase,
  CheckCircle2,
  ArrowRight,
  CalendarDays,
  Check
} from 'lucide-react';
import { Button } from '@plinth/ui';
export function EmployeePortalDashboard({ includeProductionWork = false }: { includeProductionWork?: boolean }) {
  const { data: currentUser } = useCurrentUser();
  const employeeId = currentUser?.employeeRefId;
  const {
    data: productionSchedules = [],
    isLoading: loadingProductionWork,
    isError: productionWorkError,
  } = useProductionSchedules(undefined, includeProductionWork);

  const [tasks, setTasks] = useState<EmployeeTaskDto[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState({
    present: 0,
    absent: 0,
    leaveSick: 0,
    leaveCasual: 0,
    leavePaid: 0,
    leaveUnpaid: 0,
    halfDay: 0,
    totalRecorded: 0
  });
  const [loading, setLoading] = useState(true);
  const [punchMsg, setPunchMsg] = useState<string | null>(null);
  const [taskActionError, setTaskActionError] = useState<string | null>(null);

  const loadEmployeeData = async () => {
    if (!employeeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allTasks, attData] = await Promise.all([
        hrApi.getTasks({ employeeId }),
        hrApi.getAttendance(employeeId)
      ]);
      setTasks(allTasks);
      setAttendanceSummary(attData.summary || {
        present: 0,
        absent: 0,
        leaveSick: 0,
        leaveCasual: 0,
        leavePaid: 0,
        leaveUnpaid: 0,
        halfDay: 0,
        totalRecorded: 0
      });
    } catch (err) {
      console.error('Failed to load employee dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeeData();
  }, [employeeId]);

  const handleQuickPunch = async (status: string) => {
    if (!employeeId) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await hrApi.markAttendance({
        employeeId,
        date: todayStr,
        status,
        workHours: status === 'PRESENT' ? 8.5 : status === 'HALF_DAY' ? 4 : 0,
        notes: `Quick self punch: ${status}`
      });
      setPunchMsg(`Recorded attendance as ${status}!`);
      setTimeout(() => setPunchMsg(null), 3000);
      loadEmployeeData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to record punch');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: EmployeeTaskDto['status']) => {
    setTaskActionError(null);
    try {
      await hrApi.updateTask(taskId, { status });
      loadEmployeeData();
    } catch (err: unknown) {
      setTaskActionError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
  const pendingTasks = tasks.filter((t) => t.status !== 'COMPLETED');
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 100;
  const assignedProductionWork = productionSchedules.flatMap((schedule) => schedule.batches.map((batch) => ({ schedule, batch })));

  if (!employeeId) {
    return (
      <div className="flex-1 w-full min-h-[60vh] bg-muted/20 p-6 flex items-center justify-center">
        <div className="max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-xs space-y-2">
          <h1 className="text-lg font-bold text-foreground">Worker profile not linked</h1>
          <p className="text-sm text-muted-foreground">This login is not linked to an employee record yet. Ask an administrator to link the worker account to the employee profile for its department.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Welcome Header & Quick Punch */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary bg-primary/10 px-2 py-0.5 rounded-md">
              Self-Service Portal
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Welcome back, {currentUser?.firstName || currentUser?.name || 'Team Member'}!
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Track your daily shift attendance, complete assigned workstation tasks, and manage leave balances.
          </p>
        </div>

        {/* Quick Shift Punch */}
        <div className="bg-muted/40 p-4 rounded-xl border border-border space-y-2 min-w-[260px]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            Today&apos;s Attendance Punch
          </span>
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={() => handleQuickPunch('PRESENT')}
              size="sm"
              variant="primary"
              className="flex-1 text-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Punch Present
            </Button>
            <Button
              onClick={() => handleQuickPunch('HALF_DAY')}
              size="sm"
              variant="outline"
              className="text-xs"
            >
              Half Day
            </Button>
          </div>
        </div>
      </div>

      {punchMsg && (
        <div className="p-4 bg-primary/10 border border-primary/20 text-primary rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <Check className="w-4 h-4" />
          {punchMsg}
        </div>
      )}

      {includeProductionWork && (
        <section className="bg-card rounded-2xl border border-border shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-base font-bold text-foreground">My Assigned Production Work</h2>
              <p className="text-xs text-muted-foreground mt-1">Only batches assigned to your worker profile appear here.</p>
            </div>
            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-bold text-primary">{assignedProductionWork.length}</span>
          </div>
          {loadingProductionWork ? (
            <p className="p-6 text-center text-xs text-muted-foreground">Loading your assigned production work…</p>
          ) : productionWorkError ? (
            <p role="alert" className="p-6 text-center text-xs text-destructive">Could not load assigned production work. Refresh the page or contact your department head.</p>
          ) : assignedProductionWork.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted-foreground">No production batches have been assigned to you yet. Your department head can assign a batch from Production Execution.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {assignedProductionWork.map(({ schedule, batch }) => {
                const completed = Number(batch.completed_qty || 0);
                const expected = Number(batch.expectedOutputQty || 0);
                const progress = expected > 0 ? Math.min(100, Math.round((completed / expected) * 100)) : 0;
                return (
                  <Link key={batch.id} href={`/production/execution/${batch.id}`} className="rounded-xl border border-border p-4 transition-colors hover:border-primary/50 hover:bg-muted/30">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-foreground">{schedule.product.name}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{schedule.planNumber} · {batch.department.name}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{batch.routeStep?.stepName || 'Production operation'}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold text-foreground">{batch.status.replaceAll('_', ' ')}</span>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Progress</span>
                      <span className="font-mono font-semibold text-foreground">{completed} / {expected} ({progress}%)</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: progress + '%' }} />
                    </div>
                    <p className="mt-3 text-[11px] font-semibold text-primary">Open assigned work →</p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {taskActionError && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs font-medium text-destructive">{taskActionError}</div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active Tasks</span>
            <div className="text-2xl sm:text-3xl font-black text-foreground">{pendingTasks.length}</div>
            <span className="text-[11px] text-muted-foreground">Assigned workload items</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completed Tasks</span>
            <div className="text-2xl sm:text-3xl font-black text-foreground">{completedTasks.length}</div>
            <span className="text-[11px] text-muted-foreground">{completionRate}% completion rate</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Days Present</span>
            <div className="text-2xl sm:text-3xl font-black text-foreground">{attendanceSummary.present}</div>
            <span className="text-[11px] text-muted-foreground">Verified monthly shifts</span>
          </div>
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border shadow-xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Leaves Taken</span>
            <div className="text-2xl sm:text-3xl font-black text-foreground">
              {attendanceSummary.leaveSick + attendanceSummary.leaveCasual + attendanceSummary.leavePaid}
            </div>
            <span className="text-[11px] text-muted-foreground">Casual, sick, & paid leaves</span>
          </div>
          <div className="p-2.5 rounded-xl bg-muted text-muted-foreground">
            <CalendarDays className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Grid: Assigned Workstation Tasks & Quick Attendance Shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: My Assigned Tasks */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-foreground">My Workstation Tasks</span>
              <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-bold text-primary">
                {tasks.length}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {pendingTasks.length} pending
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading your tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
              <p className="text-sm font-semibold text-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground">You currently have no pending tasks assigned.</p>
            </div>
          ) : (
            <div className="divide-y divide-border space-y-2">
              {tasks.map((task) => (
                <div key={task.id} className="pt-3 first:pt-0 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        task.priority === 'URGENT' ? 'bg-destructive/10 text-destructive' :
                        task.priority === 'HIGH' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {task.priority}
                      </span>
                      <h3 className="text-xs font-bold text-foreground">{task.title}</h3>
                    </div>
                    {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                    <div className="text-[11px] text-muted-foreground">
                      {task.dueDate ? `Due Date: ${new Date(task.dueDate).toLocaleDateString()}` : `Created: ${new Date(task.createdAt).toLocaleDateString()}`}
                    </div>
                  </div>

                  {task.status === 'COMPLETED' || task.status === 'UNDER_REVIEW' || task.status === 'CANCELLED' ? (
                    <span className="rounded-lg bg-muted px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">
                      {task.status === 'COMPLETED' ? 'Approved' : task.status === 'UNDER_REVIEW' ? 'Awaiting review' : 'Cancelled'}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant={task.status === 'IN_PROGRESS' ? 'primary' : 'outline'}
                      className="shrink-0 text-[11px]"
                      onClick={() => handleUpdateTaskStatus(task.id, task.status === 'IN_PROGRESS' ? 'UNDER_REVIEW' : 'IN_PROGRESS')}
                    >
                      {task.status === 'IN_PROGRESS' ? 'Submit for review' : 'Start task'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Quick Attendance & Leave Actions */}
        <div className="bg-card rounded-2xl border border-border shadow-xs p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <h2 className="text-base font-bold text-foreground">Self-Service Shortcuts</h2>
          </div>

          <div className="space-y-3">
            <Link
              href="/attendance"
              className="p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 transition flex items-center justify-between group"
            >
              <div>
                <span className="font-bold text-xs text-foreground block">Attendance & Leaves</span>
                <span className="text-[11px] text-muted-foreground">Apply for leave, review history & punch logs</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition" />
            </Link>

            <Link
              href="/profile"
              className="p-4 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 transition flex items-center justify-between group"
            >
              <div>
                <span className="font-bold text-xs text-foreground block">My Profile & Documents</span>
                <span className="text-[11px] text-muted-foreground">View personal data and role assignments</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
