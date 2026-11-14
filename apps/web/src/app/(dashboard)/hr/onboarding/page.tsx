'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useEmployees } from '@/features/hr/hooks';
import { EmployeeDto } from '@plinth/types';
import {
  UserCheck,
  Clock,
  CheckCircle2,
  Search,
  UserPlus,
  ArrowRight,
  Copy,
  ShieldCheck
} from 'lucide-react';
import { Button, Card, PageHeader, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@plinth/ui';
import { getEmployeeOnboardingLink } from '@/lib/env';

export default function HrOnboardingHubPage() {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { employees, loading, error } = useEmployees({
    search: searchTerm || undefined
  });

  const completedEmployees = employees.filter((e) => e.onboardingCompleted);
  const pendingEmployees = employees.filter((e) => !e.onboardingCompleted);

  const displayedEmployees =
    activeFilter === 'COMPLETED'
      ? completedEmployees
      : activeFilter === 'PENDING'
      ? pendingEmployees
      : employees;

  const copyInviteLink = (emp: EmployeeDto) => {
    const link = getEmployeeOnboardingLink(emp.email);
    navigator.clipboard.writeText(link);
    setCopiedId(emp.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6 font-sans">
      {/* PageHeader Component matching Inventory & Job Work */}
      <PageHeader
        title="Onboarding & Compliance Hub"
        actions={
          <Link href="/hr/new">
            <Button size="sm" className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs">
              <UserPlus className="w-4 h-4" />
              Add New Employee & Invite
            </Button>
          </Link>
        }
      />

      {/* 3 Full-Width KPI Metric Cards matching Inventory / Job Work design */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        <div
          onClick={() => setActiveFilter('ALL')}
          className={`rounded-2xl border p-5 shadow-xs transition-all cursor-pointer relative overflow-hidden group bg-card ${
            activeFilter === 'ALL'
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-border/80 hover:border-primary/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Total Hires
            </span>
            <div className="rounded-xl bg-primary/10 p-2 text-primary border border-primary/20">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {employees.length}
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveFilter('COMPLETED')}
          className={`rounded-2xl border p-5 shadow-xs transition-all cursor-pointer relative overflow-hidden group bg-card ${
            activeFilter === 'COMPLETED'
              ? 'border-tone-green-solid/25 ring-2 ring-tone-green-solid/25'
              : 'border-border/80 hover:border-tone-green-solid/25'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Completed Onboarding
            </span>
            <div className="rounded-xl bg-tone-green-bg p-2 text-tone-green-text border border-tone-green-solid/25">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {completedEmployees.length}
            </span>
          </div>
        </div>

        <div
          onClick={() => setActiveFilter('PENDING')}
          className={`rounded-2xl border p-5 shadow-xs transition-all cursor-pointer relative overflow-hidden group bg-card ${
            activeFilter === 'PENDING'
              ? 'border-tone-amber-solid/25 ring-2 ring-tone-amber-solid/25'
              : 'border-border/80 hover:border-tone-amber-solid/25'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Pending Onboarding
            </span>
            <div className="rounded-xl bg-tone-amber-bg p-2 text-tone-amber-text border border-tone-amber-solid/25">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold tracking-tight text-foreground font-mono">
              {pendingEmployees.length}
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 w-full bg-card p-4 rounded-2xl border border-border shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, email, employee code, designation..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 font-semibold"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant={activeFilter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveFilter('ALL')}
            className="text-xs h-8 font-semibold rounded-xl"
          >
            All ({employees.length})
          </Button>
          <Button
            variant={activeFilter === 'PENDING' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveFilter('PENDING')}
            className="text-xs h-8 font-semibold rounded-xl"
          >
            Pending ({pendingEmployees.length})
          </Button>
          <Button
            variant={activeFilter === 'COMPLETED' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveFilter('COMPLETED')}
            className="text-xs h-8 font-semibold rounded-xl"
          >
            Completed ({completedEmployees.length})
          </Button>
        </div>
      </div>

      {/* Unified Table Card matching Inventory Table */}
      <Card className="shadow-xs overflow-hidden border border-border/80 w-full rounded-2xl p-0">
        <div className="p-4 border-border-strong border-border/80 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              Employee Onboarding & Compliance Records
            </h2>
            <span className="text-xs text-muted-foreground font-medium">
              ({displayedEmployees.length} records)
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            HR Onboarding Register
          </span>
        </div>
        {loading ? (
          <div className="p-12 text-center text-xs text-muted-foreground font-medium">
            <div className="animate-spin w-6 h-6 border-border border-primary border-t-transparent rounded-full mx-auto mb-3" />
            Loading onboarding records...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-destructive text-xs font-semibold">{error}</div>
        ) : displayedEmployees.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">
            <UserCheck className="w-8 h-8 mx-auto mb-2 opacity-50 text-muted-foreground" />
            <p className="font-semibold text-foreground">No onboarding records found</p>
            <p className="mt-1">No employee records match your active filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">Employee</TableHead>
                  <TableHead className="font-bold">Designation & Dept</TableHead>
                  <TableHead className="font-bold">Onboarding Status</TableHead>
                  <TableHead className="font-bold">Invite Link</TableHead>
                  <TableHead className="font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedEmployees.map((emp) => (
                  <TableRow key={emp.id} className="transition-colors hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                          {emp.firstName?.[0]}{emp.lastName?.[0]}
                        </div>
                        <div>
                          <Link
                            href={`/hr/employees/${emp.id}`}
                            className="font-semibold text-foreground hover:text-primary transition-colors text-xs"
                          >
                            {emp.firstName} {emp.lastName}
                          </Link>
                          <div className="text-[11px] text-muted-foreground font-mono">{emp.employeeCode} • {emp.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-foreground text-xs">
                        {emp.designation || emp.role}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{emp.department?.name || 'General Plant'}</div>
                    </TableCell>
                    <TableCell>
                      {emp.onboardingCompleted ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-tone-green-bg text-tone-green-text border border-tone-green-solid/25">
                          <CheckCircle2 className="w-3 h-3 text-tone-green-text" />
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-tone-amber-bg text-tone-amber-text border border-tone-amber-solid/25">
                          <Clock className="w-3 h-3 text-tone-amber-text" />
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyInviteLink(emp)}
                        className="h-7 text-[11px] gap-1.5 px-3 font-semibold rounded-lg bg-background border-border hover:bg-muted/60"
                      >
                        <Copy className="w-3 h-3 text-muted-foreground" />
                        {copiedId === emp.id ? 'Copied Link' : 'Copy Onboarding Link'}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/hr/employees/${emp.id}`}>
                        <Button variant="ghost" size="sm" className="h-7 text-xs font-semibold gap-1 text-primary hover:underline">
                          Profile
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
      )}
      </Card>
    </div>
  );
}
