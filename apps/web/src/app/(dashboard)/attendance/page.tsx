'use client';

import React, { useState, useEffect } from 'react';
import { useCurrentUser } from '@/features/auth/hooks';
import { hrApi } from '@/features/hr/api';
import { AttendanceDto, EmployeeTaskDto } from '@plinth/types';
import {
  Calendar,
  Clock,
  CheckCircle2,
  CalendarDays,
  Plus,
  Check,
  Activity,
  FileText
} from 'lucide-react';
import { Button, Dialog, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@plinth/ui';
import { EmployeeActivityHeatmap } from '@/features/hr/components/EmployeeActivityHeatmap';

export default function EmployeeAttendancePortal() {
  const { data: currentUser, isLoading } = useCurrentUser();
  const employeeId = currentUser?.employeeRefId || currentUser?.id;

  const [attendanceData, setAttendanceData] = useState<{
    records: AttendanceDto[];
    summary: {
      present: number;
      absent: number;
      leaveSick: number;
      leaveCasual: number;
      leavePaid: number;
      leaveUnpaid: number;
      halfDay: number;
      totalRecorded: number;
    };
  }>({
    records: [],
    summary: {
      present: 0,
      absent: 0,
      leaveSick: 0,
      leaveCasual: 0,
      leavePaid: 0,
      leaveUnpaid: 0,
      halfDay: 0,
      totalRecorded: 0
    }
  });

  const [tasks, setTasks] = useState<EmployeeTaskDto[]>([]);
  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves' | 'activity'>('attendance');
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [punchSuccess, setPunchSuccess] = useState<string | null>(null);

  const [leaveForm, setLeaveForm] = useState({
    startDate: new Date().toISOString().split('T')[0],
    leaveType: 'LEAVE_CASUAL',
    reason: ''
  });

  const fetchAttendance = async () => {
    if (!employeeId) return;
    setLoadingAttendance(true);
    try {
      const [data, taskList] = await Promise.all([
        hrApi.getAttendance(employeeId),
        hrApi.getTasks({ employeeId }).catch(() => [])
      ]);
      setAttendanceData(data);
      setTasks(taskList);
    } catch (err) {
      console.error('Failed to fetch attendance records:', err);
    } finally {
      setLoadingAttendance(false);
    }
  };
  useEffect(() => {
    fetchAttendance();
  }, [employeeId]);

  // Live Check-in / Punch attendance
  const handleCheckIn = async (status: string) => {
    if (!employeeId) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      await hrApi.markAttendance({
        employeeId,
        date: todayStr,
        status,
        workHours: status === 'PRESENT' ? 8.5 : status === 'HALF_DAY' ? 4 : 0,
        notes: `Self check-in marked as ${status}`
      });
      setPunchSuccess(`Attendance marked successfully as ${status}!`);
      setTimeout(() => setPunchSuccess(null), 3000);
      fetchAttendance();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to mark attendance');
    }
  };

  // Submit Leave Application
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;
    try {
      await hrApi.markAttendance({
        employeeId,
        date: leaveForm.startDate,
        status: leaveForm.leaveType,
        workHours: 0,
        notes: `Leave Application: ${leaveForm.reason}`
      });
      setIsLeaveModalOpen(false);
      setLeaveForm({
        startDate: new Date().toISOString().split('T')[0],
        leaveType: 'LEAVE_CASUAL',
        reason: ''
      });
      setPunchSuccess('Leave application recorded successfully!');
      setTimeout(() => setPunchSuccess(null), 3000);
      fetchAttendance();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to submit leave application');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-12 flex flex-col items-center justify-center text-muted-foreground">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mb-3" />
        <p className="text-xs font-medium">Loading attendance portal...</p>
      </div>
    );
  }

  const { summary, records } = attendanceData;
  const totalLeaves = summary.leaveSick + summary.leaveCasual + summary.leavePaid + summary.leaveUnpaid;

  return (
    <div className="min-h-screen bg-muted/20 p-6 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-xl border border-border shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 rounded-lg text-primary">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              My Attendance &amp; Leave Portal
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Check-in daily, review attendance summaries, and submit sick/casual/paid leave requests.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setIsLeaveModalOpen(true)}
            className="gap-2 text-xs"
          >
            <Plus className="w-4 h-4" />
            Apply for Leave
          </Button>
        </div>
      </div>

      {punchSuccess && (
        <div className="p-3 bg-muted border border-border text-foreground rounded-lg text-xs font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" />
          {punchSuccess}
        </div>
      )}

      {/* Daily Quick Punch Action Box */}
      <div className="bg-card rounded-xl p-6 border border-border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Daily Punch &amp; Check-In</span>
          <h2 className="text-lg font-bold text-foreground">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h2>
          <p className="text-xs text-muted-foreground">
            Click to record today&apos;s shift attendance or mark half-day status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => handleCheckIn('PRESENT')}
            className="gap-1.5 text-xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            Mark Present (8.5h)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCheckIn('HALF_DAY')}
            className="gap-1.5 text-xs"
          >
            <Clock className="w-4 h-4 text-amber-500" />
            Mark Half Day (4h)
          </Button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Days Present</span>
          <div className="text-2xl font-bold text-foreground mt-1">{summary.present}</div>
          <span className="text-[11px] text-muted-foreground">Total verified shifts</span>
        </div>

        <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leaves Taken</span>
          <div className="text-2xl font-bold text-foreground mt-1">{totalLeaves}</div>
          <span className="text-[11px] text-muted-foreground">Sick, casual, paid &amp; unpaid</span>
        </div>

        <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Half Days</span>
          <div className="text-2xl font-bold text-foreground mt-1">{summary.halfDay}</div>
          <span className="text-[11px] text-muted-foreground">Partial work hours</span>
        </div>

        <div className="bg-card p-5 rounded-xl border border-border shadow-xs">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unplanned Absences</span>
          <div className="text-2xl font-bold text-destructive mt-1">{summary.absent}</div>
          <span className="text-[11px] text-muted-foreground">Unapproved absences</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'attendance'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          <span>Attendance History</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('leaves')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'leaves'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Leave Requests ({summary.leaveSick + summary.leaveCasual + summary.leavePaid + summary.leaveUnpaid})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'activity'
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Activity & Performance Map</span>
        </button>
      </div>

      {/* TAB 1: Attendance History Table */}
      {activeTab === 'attendance' && (
        <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden space-y-3 p-6">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            Full Attendance Logs
          </h3>
        {loadingAttendance ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading records...</div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs font-medium">No attendance records logged yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Work Hours</TableHead>
                <TableHead>Remarks / Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((att) => {
                return (
                  <TableRow key={att.id}>
                    <TableCell className="font-medium text-xs">
                      {new Date(att.date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground border border-border">
                        {att.status.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{att.workHours ? `${att.workHours} hrs` : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{att.notes || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        </div>
      )}

      {/* TAB 2: Leave Applications History */}
      {activeTab === 'leaves' && (
        <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden space-y-3 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Leave Applications & Time-Off History
            </h3>
            <Button size="sm" onClick={() => setIsLeaveModalOpen(true)} className="text-xs gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Apply for Leave
            </Button>
          </div>

          {records.filter(r => r.status.startsWith('LEAVE_')).length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs font-medium">No leave applications recorded yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave Date</TableHead>
                  <TableHead>Leave Category</TableHead>
                  <TableHead>Application Status</TableHead>
                  <TableHead>Reason & Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.filter(r => r.status.startsWith('LEAVE_')).map((att) => (
                  <TableRow key={att.id}>
                    <TableCell className="font-medium text-xs">
                      {new Date(att.date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        {att.status.replace('LEAVE_', '') + ' LEAVE'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Recorded / Approved
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{att.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* TAB 3: Activity Heatmap & Performance Contribution */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          <EmployeeActivityHeatmap
            attendances={records}
            tasks={tasks}
          />

          {/* Activity Tasks List */}
          <div className="bg-card rounded-2xl border border-border shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Recent Workstation Activity & Tasks ({tasks.length})
              </h3>
            </div>

            {tasks.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                No tasks logged on your account yet. Daily check-ins contribute directly to your activity score.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {tasks.slice(0, 10).map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{t.title}</p>
                      <p className="text-[11px] text-muted-foreground">{t.department || 'Operations'} · Priority: {t.priority}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      t.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                    }`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Leave Application Dialog */}
      <Dialog
        open={isLeaveModalOpen}
        onClose={() => setIsLeaveModalOpen(false)}
        title="Apply for Leave"
        description="Submit your planned leave dates and category."
        className="max-w-md"
      >
        <form onSubmit={handleApplyLeave} className="space-y-3 text-xs">
          <div>
            <label className="font-medium text-foreground block mb-1">
              Leave Date *
            </label>
            <input
              type="date"
              required
              value={leaveForm.startDate}
              onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="font-medium text-foreground block mb-1">
              Leave Category *
            </label>
            <select
              value={leaveForm.leaveType}
              onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="LEAVE_CASUAL">Casual Leave (CL)</option>
              <option value="LEAVE_SICK">Sick Leave (SL)</option>
              <option value="LEAVE_PAID">Paid Leave (PL)</option>
              <option value="LEAVE_UNPAID">Unpaid Leave (LWP)</option>
            </select>
          </div>

          <div>
            <label className="font-medium text-foreground block mb-1">
              Reason for Leave *
            </label>
            <textarea
              required
              rows={3}
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
              placeholder="Explain reason for leave..."
              className="w-full px-3 py-1.5 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-border gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsLeaveModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs"
            >
              Submit Application
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
