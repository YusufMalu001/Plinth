export interface RouteSnapshotStep {
  stepName?: string | null;
  departmentId?: string | null;
  durationMinutes?: string | number | null;
  standardDurationMinutes?: string | number | null;
}

/** Compare route content without temporary row IDs or harmless number formatting. */
export function getRouteSnapshot(name: string, steps: RouteSnapshotStep[]) {
  return JSON.stringify({
    name: name.trim(),
    steps: steps.map((step) => {
      const rawDuration = String(step.durationMinutes ?? step.standardDurationMinutes ?? '').trim();
      const numericDuration = rawDuration === '' ? '' : Number(rawDuration);
      return {
        stepName: (step.stepName || '').trim(),
        departmentId: (step.departmentId || '').trim(),
        durationMinutes: numericDuration === '' || !Number.isFinite(numericDuration) ? rawDuration : String(numericDuration),
      };
    }),
  });
}

export function isRouteReadyToSave(
  name: string,
  steps: RouteSnapshotStep[],
  selectedRouteId: string,
  baseline: { id: string; snapshot: string } | null,
) {
  if (!name.trim() || steps.length === 0 || steps.some((step) => !step.stepName?.trim() || !step.departmentId?.trim())) return false;
  if (!selectedRouteId) return true;
  return baseline?.id === selectedRouteId && getRouteSnapshot(name, steps) !== baseline.snapshot;
}
