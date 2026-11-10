'use client';

import React, { useState, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Workflow,
  Factory,
  Plus,
  ArrowLeft,
  Search,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  ArrowRight
} from 'lucide-react';
import {
  Button,
  Card,
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Input,
} from '@synergy/ui';
import { fetchApi } from '@/features/api/client';
import { DepartmentDialog } from '@/components/DepartmentDialog';
import { ShopFloorDepartmentList } from './ShopFloorDepartmentList';
import { useDepartments } from '@/hooks/useMasterData';
import { isProductionExecutionDepartment } from '@/features/production/types';
import { StatusBadge } from '@/components/StatusBadge';
import { EmptyState } from '@/components/EmptyState';

interface RouteStepItem {
  id: string;
  branchKey?: string | null;
  stepOrder?: number | null;
  sequenceNumber: number;
  stepName: string;
  departmentId: string;
  department: {
    id: string;
    name: string;
    code?: string;
  };
}

interface ProductionRouteItem {
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
  graphReviewedAt: string | null;
  productId?: string | null;
  product?: {
    id: string;
    name: string;
    sku?: string;
  } | null;
  assemblyDepartmentId?: string | null;
  assemblyDepartment?: {
    id: string;
    name: string;
    code?: string;
  } | null;
  steps: RouteStepItem[];
}

export function ProductionRoutesWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routingBase = pathname.startsWith('/production/routing') ? '/production/routing' : '/inventory/routing';
  const initialSection = searchParams.get('section') === 'departments' ? 'departments' : 'routes';

  const [activeSection, setActiveSection] = useState<'routes' | 'departments'>(initialSection);
  const [search, setSearch] = useState('');
  const [filterReview, setFilterReview] = useState<'ALL' | 'REVIEWED' | 'NEEDS_REVIEW'>('ALL');
  const [createDeptOpen, setCreateDeptOpen] = useState(false);

  const { data: deptData } = useDepartments('ACTIVE');
  const allDepartments = deptData?.items || [];
  const shopFloorDepartments = allDepartments.filter(isProductionExecutionDepartment);
  const shopFloorCount = shopFloorDepartments.length;

  const { data, isLoading, error } = useQuery<{ items: ProductionRouteItem[] }>({
    queryKey: ['production-routes-list'],
    queryFn: () => fetchApi('/master-data/routing/routes')
  });

  const routes = useMemo(() => {
    const list = data?.items || [];
    return list.filter((r) => {
      const matchSearch =
        !search.trim() ||
        `${r.name} ${r.code} ${r.product?.name || ''}`.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      if (filterReview === 'REVIEWED') return Boolean(r.graphReviewedAt);
      if (filterReview === 'NEEDS_REVIEW') return !r.graphReviewedAt;
      return true;
    });
  }, [data?.items, search, filterReview]);

  return (
    <div className="flex-1 w-full overflow-y-auto bg-muted/20 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Page Header */}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            {activeSection === 'departments' ? 'Shop Floor Departments' : 'Production Routes'}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {activeSection === 'departments'
              ? 'Shop floor production work centers and active processing departments'
              : 'Multi-branch routing graphs, dependent subroutes, and BOM material allocations'}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {activeSection === 'departments' ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveSection('routes')}
                icon={ArrowLeft}
                className="font-semibold text-xs border-border bg-card hover:bg-muted text-foreground cursor-pointer"
              >
                Back to Production Routes
              </Button>
              <Button
                type="button"
                onClick={() => setCreateDeptOpen(true)}
                size="sm"
                icon={Plus}
                className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs cursor-pointer"
              >
                Add Department
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveSection('departments')}
                icon={Factory}
                className="font-semibold text-xs border-border bg-card hover:bg-muted text-foreground cursor-pointer"
              >
                Shop Floor Departments ({shopFloorCount})
              </Button>
              <Button
                type="button"
                onClick={() => router.push(`${routingBase}/new`)}
                size="sm"
                icon={Plus}
                className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm text-xs cursor-pointer"
              >
                Create Production Route
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Page Section Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-border/70 pb-3">
        <button
          type="button"
          data-testid="section-routes"
          onClick={() => setActiveSection('routes')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeSection === 'routes'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Workflow className="w-4 h-4" />
          <span>Production Routes</span>
        </button>

        <button
          type="button"
          data-testid="section-departments"
          onClick={() => setActiveSection('departments')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeSection === 'departments'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Factory className="w-4 h-4" />
          <span>Shop Floor Departments</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              activeSection === 'departments' ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
            }`}
          >
            {shopFloorCount}
          </span>
        </button>
      </div>

      {/* Section 1: Production Routes Table */}
      {activeSection === 'routes' && (
        <div className="space-y-4">
          {/* Table Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search production routes, products, or code..."
                icon={Search}
                className="bg-background text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setFilterReview('ALL')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    filterReview === 'ALL'
                      ? 'bg-background shadow-xs text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All ({data?.items?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterReview('REVIEWED')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                    filterReview === 'REVIEWED'
                      ? 'bg-background shadow-xs text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Reviewed
                </button>
                <button
                  type="button"
                  onClick={() => setFilterReview('NEEDS_REVIEW')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                    filterReview === 'NEEDS_REVIEW'
                      ? 'bg-background shadow-xs text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Review Required
                </button>
              </div>
            </div>
          </div>

          {/* Table Card */}
          <Card className="border border-border shadow-xs overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
                <p>Loading production routes...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center text-sm text-destructive">
                Failed to load production routes. Please try refreshing.
              </div>
            ) : routes.length === 0 ? (
              <EmptyState
                title="No production routes found"
                description={
                  search
                    ? 'No routes match your search filters.'
                    : 'Get started by creating your first multi-branch production route.'
                }
                action={
                  <Button
                    size="sm"
                    icon={Plus}
                    onClick={() => router.push(`${routingBase}/new`)}
                  >
                    Create Route
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Route Code</TableHead>
                      <TableHead className="w-[280px]">Route & Product</TableHead>
                      <TableHead>Parallel Branches & Operations</TableHead>
                      <TableHead className="w-[120px]">Status</TableHead>
                      <TableHead className="w-[72px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((route) => {
                      const steps = route.steps || [];
                      const branchKeys = [
                        ...new Set(steps.map((s) => s.branchKey).filter(Boolean))
                      ] as string[];
                      const isReviewed = Boolean(route.graphReviewedAt);

                      return (
                        <TableRow
                          key={route.id}
                          tabIndex={0}
                          className="hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary transition-colors cursor-pointer group"
                          onClick={() => router.push(`${routingBase}/${route.id}/details`)}
                          onKeyDown={(event) => {
                            if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                              event.preventDefault();
                              router.push(`${routingBase}/${route.id}/details`);
                            }
                          }}
                        >
                          {/* Route Code */}
                          <TableCell className="align-top py-4">
                            <span className="font-mono text-xs font-semibold text-foreground">{route.code}</span>
                          </TableCell>

                          {/* Route Name & Product */}
                          <TableCell className="align-top py-4">
                            <div className="space-y-1">
                              <div className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                                {route.name}
                              </div>
                              {route.product?.name ? (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                                  <Boxes className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                                  <span className="truncate max-w-[240px]">
                                    {route.product.name}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs italic text-muted-foreground/80">
                                  No product linked
                                </span>
                              )}
                            </div>
                          </TableCell>

                          {/* Parallel Branches */}
                          <TableCell className="align-top py-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  {branchKeys.length > 0 ? `${branchKeys.length} branch${branchKeys.length === 1 ? '' : 'es'}` : '1 branch'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {steps.length} department step{steps.length === 1 ? '' : 's'}
                                </span>
                              </div>

                              {/* Branch Flow Previews */}
                              <div className="flex flex-col gap-1.5 max-w-xl">
                                {branchKeys.length > 0 ? (
                                  branchKeys.map((bKey) => {
                                    const bSteps = steps
                                      .filter((s) => s.branchKey === bKey)
                                      .sort((a, b) => (a.stepOrder ?? a.sequenceNumber) - (b.stepOrder ?? b.sequenceNumber));
                                    return (
                                      <div
                                        key={bKey}
                                        className="text-xs flex items-center gap-1.5 text-muted-foreground overflow-hidden"
                                      >
                                        <strong className="text-foreground shrink-0">{bKey}:</strong>
                                        <div className="flex items-center gap-1 truncate font-medium">
                                          {bSteps.map((s, idx) => (
                                            <React.Fragment key={s.id}>
                                              {idx > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />}
                                              <span className="truncate text-foreground/90">
                                                {s.department?.name || s.stepName}
                                              </span>
                                            </React.Fragment>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="text-xs flex items-center gap-1.5 text-muted-foreground font-medium">
                                    {steps.map((s, idx) => (
                                      <React.Fragment key={s.id}>
                                        {idx > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />}
                                        <span>{s.department?.name || s.stepName}</span>
                                      </React.Fragment>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Status & Review Pill */}
                          <TableCell className="align-top py-4">
                            <div className="space-y-1.5">
                              <StatusBadge status={route.status as any} />
                              <div>
                                {isReviewed ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Reviewed
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="w-3 h-3" />
                                    Review Required
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Edit Action */}
                          <TableCell className="align-top py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              icon={Pencil}
                              aria-label={`Edit ${route.name}`}
                              title="Edit route"
                              onClick={() => router.push(`${routingBase}/${route.id}`)}
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                            >
                            </Button>
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
      )}

      {/* Section 2: Shop Floor Departments */}
      {activeSection === 'departments' && (
        <section aria-label="Shop Floor Departments Section">
          <ShopFloorDepartmentList />
        </section>
      )}

      <DepartmentDialog
        open={createDeptOpen}
        onClose={() => setCreateDeptOpen(false)}
        departmentCodePrefix="SHOP"
      />
    </div>
  );
}
