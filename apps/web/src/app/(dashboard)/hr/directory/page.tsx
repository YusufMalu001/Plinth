'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useEmployees } from '@/features/hr/hooks';
import { EmployeeDto } from '@synergy/types';
import {
  Users,
  Search,
  UserPlus,
  Building2,
  ChevronRight,
  CheckCircle2,
  Clock,
  RotateCcw
} from 'lucide-react';
import { Button, Card, Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@synergy/ui';

export default function EmployeeDirectoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [rankingFilter, setRankingFilter] = useState('');
  const [hierarchyFilter, setHierarchyFilter] = useState('');
  const [sortBy, setSortBy] = useState<'firstName' | 'lastName' | 'baseSalary' | 'ranking' | 'hierarchyLevel' | 'department' | 'employeeCode'>('firstName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [minSalary, setMinSalary] = useState('');
  const [maxSalary, setMaxSalary] = useState('');

  const [appliedFilters, setAppliedFilters] = useState<Record<string, unknown>>({});

  const { employees, loading, error, refetch } = useEmployees({
    search: searchTerm,
    gender: genderFilter || undefined,
    ranking: rankingFilter ? Number(rankingFilter) : undefined,
    hierarchyLevel: hierarchyFilter ? Number(hierarchyFilter) : undefined,
    minSalary: minSalary ? Number(minSalary) : undefined,
    maxSalary: maxSalary ? Number(maxSalary) : undefined,
    sortBy,
    sortOrder,
    ...appliedFilters,
  });

  const handleApplyFilter = () => {
    setAppliedFilters({
      search: searchTerm,
      gender: genderFilter || undefined,
      ranking: rankingFilter ? Number(rankingFilter) : undefined,
      hierarchyLevel: hierarchyFilter ? Number(hierarchyFilter) : undefined,
      minSalary: minSalary ? Number(minSalary) : undefined,
      maxSalary: maxSalary ? Number(maxSalary) : undefined,
      sortBy,
      sortOrder,
    });
  };

  const handleResetFilter = () => {
    setSearchTerm('');
    setGenderFilter('');
    setRankingFilter('');
    setHierarchyFilter('');
    setMinSalary('');
    setMaxSalary('');
    setSortBy('firstName');
    setSortOrder('asc');
    setAppliedFilters({});
  };

  const hierarchyLabel = (lvl?: number | null) => {
    switch (lvl) {
      case 1: return { label: 'L1 - Executive / Director', color: 'bg-primary/10 text-primary border border-primary/20' };
      case 2: return { label: 'L2 - Dept Head / Manager', color: 'bg-primary/10 text-primary border border-primary/20' };
      case 3: return { label: 'L3 - Lead / Supervisor', color: 'bg-muted text-foreground border border-border' };
      case 4: return { label: 'L4 - Staff / Specialist', color: 'bg-muted text-foreground border border-border' };
      case 5: return { label: 'L5 - Associate / Operator', color: 'bg-muted text-foreground border border-border' };
      default: return { label: `Level ${lvl || 4}`, color: 'bg-muted text-muted-foreground border border-border' };
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary bg-primary/10 px-2 py-0.5 rounded-md">
              Human Resources
            </span>
            <span className="text-xs text-muted-foreground">· Employee Directory</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Employee Directory
          </h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <Link href="/hr/new">
            <Button variant="primary" size="sm" className="gap-2 shadow-xs">
              <UserPlus className="w-4 h-4" />
              <span>Add Employee / Invite</span>
            </Button>
          </Link>
        </div>
      </header>

      {/* Filter & Sorting Hub */}
      <div className="bg-card p-5 rounded-2xl border border-border shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Box */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, code, designation, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyFilter()}
              className="w-full pl-10 pr-3 py-2.5 text-sm rounded-xl border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          {/* Hierarchy Filter */}
          <div>
            <select
              value={hierarchyFilter}
              onChange={(e) => setHierarchyFilter(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">All Hierarchy Levels</option>
              <option value="1">L1 - Executive / CXO</option>
              <option value="2">L2 - Dept Head / Manager</option>
              <option value="3">L3 - Lead / Supervisor</option>
              <option value="4">L4 - Staff / Specialist</option>
              <option value="5">L5 - Associate / Operator</option>
            </select>
          </div>

          {/* Ranking Filter */}
          <div>
            <select
              value={rankingFilter}
              onChange={(e) => setRankingFilter(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">All Rankings</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => (
                <option key={r} value={r}>Rank {r}</option>
              ))}
            </select>
          </div>

          {/* Gender Filter */}
          <div>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Non-Binary">Non-Binary</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split('-');
                setSortBy(by as any);
                setSortOrder(order as any);
              }}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            >
              <option value="firstName-asc">Name (A-Z)</option>
              <option value="firstName-desc">Name (Z-A)</option>
              <option value="hierarchyLevel-asc">Hierarchy (Highest First)</option>
              <option value="ranking-desc">Ranking (Top Rank First)</option>
              <option value="baseSalary-desc">Salary (High to Low)</option>
              <option value="baseSalary-asc">Salary (Low to High)</option>
              <option value="employeeCode-asc">Employee Code</option>
            </select>
          </div>
        </div>

        {/* Action buttons & Salary range row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-border">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Salary Range (₹):</span>
            <input
              type="number"
              placeholder="Min"
              value={minSalary}
              onChange={(e) => setMinSalary(e.target.value)}
              className="w-28 px-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="number"
              placeholder="Max"
              value={maxSalary}
              onChange={(e) => setMaxSalary(e.target.value)}
              className="w-28 px-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetFilter}
              className="text-xs text-muted-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset Filters
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleApplyFilter}
            >
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Directory Table / Cards */}
      <Card className="overflow-hidden border-border bg-card shadow-xs rounded-2xl p-0">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-sm font-medium">Loading employee directory...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-destructive">
            <p className="text-sm font-semibold">{error}</p>
            <button onClick={() => { void refetch(); }} className="mt-2 text-xs text-primary underline cursor-pointer">Try again</button>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-3 stroke-[1.5] text-muted-foreground/60" />
            <h3 className="text-base font-semibold text-foreground">No employees found</h3>
            <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters or add a new employee.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">Employee</TableHead>
                  <TableHead className="font-bold">Department & Role</TableHead>
                  <TableHead className="font-bold">Hierarchy</TableHead>
                  <TableHead className="font-bold">Ranking</TableHead>
                  <TableHead className="font-bold">Base Salary</TableHead>
                  <TableHead className="font-bold">Gender</TableHead>
                  <TableHead className="font-bold">Onboarding</TableHead>
                  <TableHead className="font-bold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp: EmployeeDto) => {
                  const hInfo = hierarchyLabel(emp.hierarchyLevel);
                  return (
                    <TableRow
                      key={emp.id}
                      className="transition-colors hover:bg-muted/40"
                    >
                      {/* Name & Code */}
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
                            <div className="text-xs text-muted-foreground font-mono">
                              {emp.employeeCode}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      {/* Department & Role */}
                      <TableCell>
                        <div className="font-semibold text-foreground text-xs">
                          {emp.designation || emp.role}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3" />
                          {emp.department?.name || 'General Operations'}
                        </div>
                      </TableCell>
                      {/* Hierarchy Level */}
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${hInfo.color}`}>
                          {hInfo.label}
                        </span>
                      </TableCell>
                      {/* Ranking */}
                      <TableCell>
                        <span className="font-semibold text-foreground text-xs">
                          Rank {emp.ranking || 1}
                        </span>
                      </TableCell>
                      {/* Base Salary */}
                      <TableCell>
                        <div className="font-semibold text-foreground text-xs font-mono">
                          ₹{Number(emp.baseSalary || 0).toLocaleString('en-IN')}
                        </div>
                      </TableCell>
                      {/* Gender */}
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {emp.gender || '—'}
                        </span>
                      </TableCell>
                      {/* Onboarding */}
                      <TableCell>
                        {emp.onboardingCompleted ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                            <Clock className="w-3 h-3" />
                            Pending Link
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/hr/employees/${emp.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline transition-all"
                        >
                          View Profile
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
