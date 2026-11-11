"use client";

import { Trash2 } from "lucide-react";
import { Button, Dialog } from "@plinth/ui";
import { StatusBadge } from "@/components/StatusBadge";
import type { ProductionPlan } from "../types";

interface CancelProductionScheduleDialogProps {
  plan: ProductionPlan | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (plan: ProductionPlan) => void;
}

export function CancelProductionScheduleDialog({
  plan,
  isPending,
  onClose,
  onConfirm,
}: CancelProductionScheduleDialogProps) {
  return (
    <Dialog
      open={Boolean(plan)}
      onClose={onClose}
      title="Cancel Production Schedule"
    >
      {plan && (
        <div className="space-y-4 pt-1">
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-black text-primary px-2.5 py-1 rounded bg-primary/10 border border-primary/20">
                {plan.planNumber}
              </span>
              <StatusBadge status={plan.status} />
            </div>
            <p className="text-sm font-bold text-foreground">
              {plan.product?.name || "Selected Product"}
            </p>
            <p className="text-xs text-muted-foreground">
              Quantity: <strong className="text-foreground">{String(plan.quantity)} {plan.product?.uom?.symbol || "units"}</strong> · Shift: <strong className="text-foreground">{plan.scheduleType}</strong> · Date: <strong className="text-foreground">{new Date(plan.scheduleDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong>
            </p>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Cancel this schedule? It will remain available in production history with a Cancelled status, and any reserved components will be released.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              type="button"
              loading={isPending}
              onClick={() => plan && onConfirm(plan)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold shadow-none"
              icon={Trash2}
            >
              Cancel Schedule
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
