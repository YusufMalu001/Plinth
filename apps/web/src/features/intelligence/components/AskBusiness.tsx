'use client';

import React, { FormEvent, useRef, useState } from 'react';
import {
  Bot,
  Check,
  ChevronRight,
  Copy,
  Factory,
  MessageSquareText,
  Package,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@plinth/ui';
import { intelligenceApi } from '../api';
import { describeEvidence, type Evidence, type IntelligenceModule } from '../types';
import { showToast } from '../../../components/toast-store';

type Answer = { text: string; evidence: Evidence[]; limitations: string[] };

const moduleOptions: { key: IntelligenceModule; name: string; icon: React.ElementType; color: string; bg: string }[] = [
  { key: 'EXECUTIVE', name: 'Executive Super Agent', icon: Bot, color: 'text-tone-purple-text', bg: 'bg-tone-purple-bg' },
  { key: 'SALES', name: 'Sales Advisor', icon: TrendingUp, color: 'text-tone-green-text', bg: 'bg-tone-green-bg' },
  { key: 'INVENTORY', name: 'Inventory Advisor', icon: Package, color: 'text-tone-amber-text', bg: 'bg-tone-amber-bg' },
  { key: 'PROCUREMENT', name: 'Procurement Advisor', icon: ShoppingCart, color: 'text-link', bg: 'bg-tone-blue-bg' },
  { key: 'PRODUCTION', name: 'Production Advisor', icon: Factory, color: 'text-tone-purple-text', bg: 'bg-tone-purple-bg' },
  { key: 'FULFILLMENT', name: 'Fulfillment Advisor', icon: Truck, color: 'text-tone-teal-text', bg: 'bg-tone-teal-bg' },
];

export function AskBusiness() {
  const [question, setQuestion] = useState('');
  const [module, setModule] = useState<IntelligenceModule>('EXECUTIVE');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [status, setStatus] = useState<string>();
  const [traceIds, setTraceIds] = useState<{ requestId: string; runId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const activeModuleOption = moduleOptions.find((m) => m.key === module) || moduleOptions[0];
  const ActiveIcon = activeModuleOption.icon;

  const handleCopy = () => {
    if (!answer?.text) return;
    void navigator.clipboard.writeText(answer.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submit = async (event?: FormEvent, directQuestion?: string, directModule?: IntelligenceModule) => {
    if (event) event.preventDefault();
    const targetQ = (directQuestion ?? question).trim();
    const targetM = directModule ?? module;

    if (targetQ.length < 1) return;
    sourceRef.current?.close();
    setAnswer(null);
    setTraceIds(null);
    setStatus('QUEUED');

    try {
      const queued = await intelligenceApi.ask(targetQ, targetM);
      setTraceIds({ requestId: queued.requestId, runId: queued.runId });
      const source = new EventSource(`/api/v1/intelligence/questions/${queued.runId}/events`, { withCredentials: true });
      sourceRef.current = source;

      source.addEventListener('status', (message) => {
        const payload = JSON.parse((message as MessageEvent).data) as { status: string };
        setStatus(payload.status);
      });

      source.addEventListener('complete', async (message) => {
        const payload = JSON.parse((message as MessageEvent).data) as {
          status: string;
          answer?: string;
          evidence?: Evidence[];
          limitations?: string[];
          errorCode?: string;
          errorMessage?: string;
        };
        setStatus(payload.status);
        source.close();

        if (payload.status === 'COMPLETED') {
          setAnswer({
            text: payload.answer ?? 'No answer was returned.',
            evidence: payload.evidence ?? [],
            limitations: payload.limitations ?? [],
          });
        } else {
          const providerBudgetError = payload.errorCode === 'PROVIDER_BUDGET_EXCEEDED';
          const failureMessage = providerBudgetError
            ? 'LLM request could not be completed because the configured output-token budget exceeds the available provider budget.'
            : payload.errorCode ?? 'The analysis was safely stopped.';
          const providerDetail = payload.errorMessage?.trim().slice(0, 1600);
          showToast({
            kind: 'error',
            title: 'Question could not be answered',
            message: providerDetail ? `${failureMessage} ${providerDetail}` : failureMessage,
          });
        }
      });

      source.onerror = () => {
        source.close();
        setStatus('DISCONNECTED');
      };
    } catch (error) {
      setStatus(undefined);
      showToast({
        kind: 'error',
        title: 'Question could not be queued',
        message: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  const presetQueries = [
    { label: 'Festive Season Surge', q: 'How should we prepare safety stock and procurement for upcoming festive surge?', mod: 'EXECUTIVE' as IntelligenceModule },
    { label: 'Bulk Raw Material Buy', q: 'Is it financially viable to purchase raw materials in bulk given holding costs?', mod: 'PROCUREMENT' as IntelligenceModule },
    { label: 'Margin Leakage Audit', q: 'Where are our biggest contribution margin leakages in sales and freight?', mod: 'SALES' as IntelligenceModule },
    { label: 'Vendor SLA Scorecard', q: 'Which suppliers have the highest lead time drift and quality variance?', mod: 'PROCUREMENT' as IntelligenceModule },
    { label: 'Production Bottlenecks', q: 'Are any workstation capacities bottlenecking our active production plans?', mod: 'PRODUCTION' as IntelligenceModule },
    { label: 'Dispatch Consolidation', q: 'Are there any multi-order vehicle consolidation opportunities to reduce outbound freight spend?', mod: 'FULFILLMENT' as IntelligenceModule },
  ];

  return (
    <Card className="border-border/80 shadow-none bg-surface">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-action text-inverse shadow-none">
              <MessageSquareText className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Ask the Business Intelligence
                <Badge variant="outline" className="border-tone-purple-solid/25 bg-tone-purple-bg text-[10px] text-tone-purple-text">
                  <Sparkles className="mr-1 h-2.5 w-2.5 text-tone-purple-text" />
                  Live Advisor
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Deterministic read-only analysis using certified ERP snapshots · Zero mutation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-tone-green-solid/25 bg-tone-green-bg px-2.5 py-1 text-[11px] font-semibold text-tone-green-text">
              <span className="h-1.5 w-1.5 rounded-full bg-tone-green-solid animate-pulse" />
              6 Agents Ready
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Preset Prompt Chips */}
        <div>
          <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground mb-2">
            <Sparkles className="h-3 w-3 text-tone-purple-text" />
            <span>Suggested strategic questions:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {presetQueries.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => {
                  setQuestion(chip.q);
                  setModule(chip.mod);
                  void submit(undefined, chip.q, chip.mod);
                }}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground transition-all hover:border-tone-purple-solid/25 hover:bg-tone-purple-bg hover:text-tone-purple-text shadow-2xs hover:shadow-xs"
              >
                <span>{chip.label}</span>
                <ChevronRight className="h-3 w-3 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </button>
            ))}
          </div>
        </div>

        {/* Input & Form */}
        <form className="flex flex-col gap-2.5 sm:flex-row" onSubmit={(e) => void submit(e)}>
          <div className="relative min-w-[200px] sm:w-[220px]">
            <select
              className="h-11 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-xs font-semibold text-foreground outline-none transition focus:border-border-strong focus:ring-2 focus:ring-accent-brand"
              value={module}
              onChange={(event) => setModule(event.target.value as IntelligenceModule)}
              aria-label="Target business advisor"
            >
              {moduleOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <ActiveIcon className="h-4 w-4" />
            </div>
          </div>

          <div className="relative flex-1">
            <input
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-xs font-medium text-foreground outline-none transition placeholder:text-muted-foreground focus:border-border-strong focus:ring-2 focus:ring-accent-brand"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={2000}
              placeholder="Ask an operational question (e.g. Which risks most reduce contribution margin?)..."
            />
          </div>

          <Button
            type="submit"
            className="h-11 px-5 rounded-xl bg-action hover:bg-[color:var(--action-primary-bg-hover)] text-inverse font-semibold text-xs transition-all shadow-none"
            icon={Send}
            loading={Boolean(status && !['COMPLETED', 'FAILED', 'REJECTED', 'DISCONNECTED'].includes(status))}
          >
            Ask Advisor
          </Button>
        </form>

        {/* Live Analysis Indicator */}
        {status && !['COMPLETED', 'FAILED', 'REJECTED', 'DISCONNECTED'].includes(status) && (
          <div className="flex items-center gap-3 rounded-xl border border-tone-purple-solid/25 bg-tone-purple-bg p-3.5 text-xs text-tone-purple-text animate-pulse">
            <div className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tone-purple-solid opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-tone-purple-solid" />
            </div>
            <div className="font-semibold">
              Running isolated <span className="underline decoration-accent-brand font-bold">{activeModuleOption.name}</span>: {status}...
            </div>
          </div>
        )}

        {/* Formatted Answer Response */}
        {traceIds && <p className="text-[11px] text-muted-foreground break-all">Request ID: {traceIds.requestId} · Run ID: {traceIds.runId}</p>}
        {answer && (
          <div className="relative rounded-2xl border border-border/80 bg-muted/30 p-5 shadow-xs transition-all">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-md ${activeModuleOption.bg} ${activeModuleOption.color}`}>
                  <ActiveIcon className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-bold text-foreground">{activeModuleOption.name} Response</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors shadow-2xs"
                >
                  {copied ? <Check className="h-3 w-3 text-tone-green-text" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <p className="whitespace-pre-wrap text-xs font-medium leading-6 text-foreground">{answer.text}</p>

            {/* Supporting Certified Evidence */}
            {Array.isArray(answer.evidence) && answer.evidence.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/60">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Certified Supporting Evidence:
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {answer.evidence.map((item, idx) => (
                      <span
                        key={item.metricKey ? `${item.metricKey}:${item.dataTimestamp || idx}` : idx}
                        title={describeEvidence(item).title}
                        className="inline-flex items-center gap-1.5 rounded-full border border-tone-purple-solid/25 bg-tone-purple-bg px-3 py-1 text-xs font-medium text-tone-purple-text"
                      >
                        <ShieldCheck className="h-3 w-3 text-tone-purple-text" />
                        {describeEvidence(item).label}
                      </span>
                  ))}
                </div>
              </div>
            )}

            {/* Known Limitations */}
            {Array.isArray(answer.limitations) && answer.limitations.length > 0 && (
              <div className="mt-3 rounded-xl bg-tone-amber-solid border border-tone-amber-solid/25 p-3 text-xs text-tone-amber-text">
                <strong>Limitations:</strong> {answer.limitations.join(' · ')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
