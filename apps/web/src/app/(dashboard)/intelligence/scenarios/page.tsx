import { IntelligenceShell } from '../../../../features/intelligence/components/IntelligenceShell';
import { SimulationWorkbench } from '../../../../features/intelligence/components/SimulationWorkbench';
import { IntelligenceScenariosView } from '../../../../features/intelligence/components/IntelligenceResourcesView';

export default function IntelligenceScenariosPage() {
  return (
    <IntelligenceShell
      title="Strategic Scenario Simulator & Laboratory"
      description="Run interactive what-if operational stress tests and review server-evaluated low, base, and high-case financial projections."
    >
      <div className="space-y-8">
        <SimulationWorkbench />
        <div className="space-y-4 pt-4 border-t border-slate-200/80 dark:border-slate-800">
          <h2 className="text-lg font-black text-slate-900 dark:text-white">
            Server-Evaluated Scenario Records & Opportunity Ranges
          </h2>
          <IntelligenceScenariosView />
        </div>
      </div>
    </IntelligenceShell>
  );
}
