"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Factory, Layers, RefreshCw } from "lucide-react";
import { Button, Card } from "@plinth/ui";
import { useProductionSchedules } from "@/features/production/execution-hooks";
import { StatusBadge } from "@/components/StatusBadge";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

export default function WorkstationQueue() {
  const { data: schedules = [], isLoading, isError, error, refetch, isFetching } = useProductionSchedules();

  const tasks = schedules.flatMap((schedule) =>
    schedule.batches.map((batch) => ({
      ...batch,
      schedule
    }))
  );

  if (isLoading && !schedules.length) {
    return <LoadingState message="Loading department workstation tasks..." />;
  }

  if (isError) {
    return <ErrorState error={error as Error} retry={() => refetch()} />;
  }

  return (
    <div className="w-full min-h-screen p-4 sm:p-6 lg:p-8 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-border-strong border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-1">
            <Link
              href="/production/execution"
              className="hover:text-primary transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Production Execution</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Factory className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                Department Workstations
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Direct floor queue for assigned shop-floor operations and batches.
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-9 gap-1.5 px-3.5 shadow-none font-semibold text-xs rounded-lg bg-card"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin text-primary" : ""}`} />
          <span>{isFetching ? "Syncing..." : "Sync Tasks"}</span>
        </Button>
      </div>

      {/* Tasks Grid */}
      {tasks.length === 0 ? (
        <Card className="rounded-xl border border-border/80 bg-card p-10 text-center shadow-xs">
          <Layers className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm font-bold text-foreground">No Active Workstation Tasks</p>
          <p className="mt-1 text-xs text-muted-foreground">
            There are no assigned production tasks awaiting execution for your department.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tasks.map((task) => {
            const comp = Number(task.completed_qty || 0);
            const exp = Number(task.expectedOutputQty || 0);
            const progress = exp > 0 ? Math.min(100, Math.round((comp / exp) * 100)) : 0;

            return (
              <Card
                key={task.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-xs transition-all hover:border-primary/50"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 border-border-strong border-border/60 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          {task.schedule.planNumber}
                        </span>
                        <StatusBadge status={task.status as any} />
                      </div>
                      <p className="text-xs font-bold text-primary mt-1">
                        {task.department.name}
                      </p>
                    </div>

                    <Link
                      href={`/production/execution/${task.id}`}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>

                  <div className="mt-3.5 space-y-1">
                    <p className="text-sm font-bold text-foreground line-clamp-1">
                      {task.schedule.product.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-medium">
                      Stage {task.routeStep?.stepOrder ?? 1}: {task.routeStep?.stepName || "Operation"}
                    </p>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-mono text-foreground font-bold">
                        {comp} / {exp} ({progress}%)
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 border-t border-border/60 pt-3">
                  <Link
                    href={`/production/execution/${task.id}`}
                    className="flex items-center justify-between w-full rounded-xl bg-card border border-border px-3.5 py-2 text-xs font-bold text-foreground hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all"
                  >
                    <span>Open Live Workstation</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
