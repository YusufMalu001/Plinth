'use client';

import React, { FormEvent, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Factory,
  Layers,
  Maximize2,
  Minimize2,
  Package,
  RotateCcw,
  Send,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react';
import { intelligenceApi } from '../api';
import { describeEvidence, type Evidence, type IntelligenceModule } from '../types';
import { showToast } from '../../../components/toast-store';

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  module: IntelligenceModule;
  text: string;
  evidence?: Evidence[];
  limitations?: string[];
  status?: string;
  timestamp: Date;
}

const moduleConfig: Record<
  IntelligenceModule,
  {
    name: string;
    short: string;
    icon: React.ElementType;
    badgeBg: string;
    badgeText: string;
    accentColor: string;
    prompts: { label: string; query: string }[];
  }
> = {
  EXECUTIVE: {
    name: 'Executive Advisor',
    short: 'Executive',
    icon: Layers,
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-800 dark:text-slate-200',
    accentColor: '#004a80',
    prompts: [
      { label: 'Festive Surge Strategy', query: 'How should we prepare safety stock and procurement for upcoming festive surge?' },
      { label: 'Enterprise Health Pulse', query: 'Provide a comprehensive enterprise health summary across all departments with strategic focus areas.' },
      { label: 'Bulk Buy vs Carrying Cost', query: 'Is it financially viable to purchase raw materials in bulk given holding costs?' },
    ],
  },
  SALES: {
    name: 'Sales & Revenue Advisor',
    short: 'Sales',
    icon: TrendingUp,
    badgeBg: 'bg-blue-50 dark:bg-blue-950/60',
    badgeText: 'text-[#004a80] dark:text-blue-300',
    accentColor: '#004a80',
    prompts: [
      { label: 'Margin Leakage Audit', query: 'Where are our biggest contribution margin leakages in sales and outbound freight?' },
      { label: 'Demand Velocity Forecast', query: 'Project our quarterly revenue run rate and high-velocity SKU trends.' },
      { label: 'Customer Opportunities', query: 'Which dormant or repeat customer segments have the highest conversion opportunity?' },
    ],
  },
  INVENTORY: {
    name: 'Inventory & Stock Advisor',
    short: 'Inventory',
    icon: Package,
    badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
    badgeText: 'text-amber-800 dark:text-amber-300',
    accentColor: '#d97706',
    prompts: [
      { label: 'Stockout Exposure', query: 'What are our current replenishment risks and stock-out exposures across warehouses?' },
      { label: 'Bulk Buy Tradeoff', query: 'Simulate bulk purchase volume discount savings against our annual inventory carrying cost.' },
      { label: 'Dead Stock & Expiry', query: 'Identify items with low inventory turnover and batch expiry risk in the next 90 days.' },
    ],
  },
  PROCUREMENT: {
    name: 'Procurement & Sourcing Advisor',
    short: 'Procurement',
    icon: ShoppingCart,
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    badgeText: 'text-indigo-800 dark:text-indigo-300',
    accentColor: '#4f46e5',
    prompts: [
      { label: 'Supplier SLA Scorecard', query: 'Score our suppliers based on on-time delivery %, lead time drift, and price variance.' },
      { label: 'Raw Material Viability', query: 'Is it financially viable to purchase raw materials in bulk given holding costs?' },
      { label: 'Overdue PO Exposure', query: 'Which purchase orders are currently delayed beyond expected receipt dates?' },
    ],
  },
  PRODUCTION: {
    name: 'Production & Plant Advisor',
    short: 'Production',
    icon: Factory,
    badgeBg: 'bg-purple-50 dark:bg-purple-950/60',
    badgeText: 'text-purple-800 dark:text-purple-300',
    accentColor: '#9333ea',
    prompts: [
      { label: 'Workstation Bottlenecks', query: 'Analyze machine capacity and highlight any potential work center bottlenecks for active production plans.' },
      { label: 'Schedule Attainment', query: 'What is our current production plan schedule attainment and completion rate?' },
      { label: 'Scrap & Loss Rates', query: 'Which workstations have the highest scrap or quality variance this month?' },
    ],
  },
  FULFILLMENT: {
    name: 'Fulfillment & Logistics Advisor',
    short: 'Fulfillment',
    icon: Truck,
    badgeBg: 'bg-teal-50 dark:bg-teal-950/60',
    badgeText: 'text-teal-800 dark:text-teal-300',
    accentColor: '#0d9488',
    prompts: [
      { label: 'Freight Consolidation', query: 'Are there any multi-order vehicle consolidation opportunities to reduce outbound freight spend?' },
      { label: 'On-Time Delivery Rate', query: 'What is our current on-time delivery rate across active logistics corridors?' },
      { label: 'Late Shipment Backlog', query: 'Which shipments are at risk of missing customer promised delivery dates?' },
    ],
  },
  QUALITY: {
    name: 'Quality Assurance Advisor',
    short: 'Quality',
    icon: ShieldCheck,
    badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
    badgeText: 'text-rose-800 dark:text-rose-300',
    accentColor: '#e11d48',
    prompts: [
      { label: 'Quality Acceptance', query: 'What is our current quality acceptance rate and defect breakdown across batches?' },
    ],
  },
  FINANCE: {
    name: 'Finance & Costing Advisor',
    short: 'Finance',
    icon: TrendingUp,
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    badgeText: 'text-emerald-800 dark:text-emerald-300',
    accentColor: '#059669',
    prompts: [
      { label: 'Contribution Margin', query: 'Summarize tax-excluded revenue, inventory COGS, and known contribution margin.' },
    ],
  },
  SYSTEM: {
    name: 'System Intelligence',
    short: 'System',
    icon: Layers,
    badgeBg: 'bg-slate-100 dark:bg-slate-800',
    badgeText: 'text-slate-800 dark:text-slate-200',
    accentColor: '#64748b',
    prompts: [],
  },
};

function formatInline(str: string): React.ReactNode {
  const parts = str.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function FormattedContent({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/);
  return (
    <div className="space-y-2.5 text-xs sm:text-sm leading-relaxed">
      {paragraphs.map((p, pIdx) => {
        const lines = p.split('\n').filter((l) => l.trim().length > 0);
        const isBulletList = lines.length > 0 && lines.every((l) => l.trim().startsWith('- ') || l.trim().startsWith('• ') || l.trim().startsWith('* '));
        const isNumberList = lines.length > 0 && lines.every((l) => /^\d+\.\s/.test(l.trim()));

        if (isBulletList) {
          return (
            <ul key={pIdx} className="list-disc pl-5 space-y-1.5 my-1.5 text-foreground/90">
              {lines.map((l, lIdx) => {
                const content = l.trim().replace(/^[-•*]\s*/, '');
                return <li key={lIdx}>{formatInline(content)}</li>;
              })}
            </ul>
          );
        }

        if (isNumberList) {
          return (
            <ol key={pIdx} className="list-decimal pl-5 space-y-1.5 my-1.5 text-foreground/90">
              {lines.map((l, lIdx) => {
                const content = l.trim().replace(/^\d+\.\s*/, '');
                return <li key={lIdx}>{formatInline(content)}</li>;
              })}
            </ol>
          );
        }

        return (
          <p key={pIdx} className="text-foreground/90">
            {lines.map((l, lIdx) => (
              <React.Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {formatInline(l)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function AskBusinessWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [module, setModule] = useState<IntelligenceModule>('EXECUTIVE');
  const [isModuleDropdownOpen, setIsModuleDropdownOpen] = useState(false);
  const [inputQuestion, setInputQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'agent',
      module: 'EXECUTIVE',
      text: "Welcome to Synergy Operational Intelligence.\n\nI continuously monitor certified ERP snapshots across Sales, Inventory, Procurement, Production, and Logistics to provide deterministic operational insights and strategy recommendations.\n\nHow can I assist your operations today?",
      timestamp: new Date(),
    },
  ]);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeConfig = moduleConfig[module] || moduleConfig.EXECUTIVE;
  const ActiveIcon = activeConfig.icon;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStatus]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsModuleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut to close or minimize on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isExpanded) {
          setIsExpanded(false);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, isOpen]);

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = async (questionText?: string) => {
    const q = (questionText ?? inputQuestion).trim();
    if (q.length < 4 || currentStatus) return;

    setInputQuestion('');
    sourceRef.current?.close();

    const userMsgId = `user-${Date.now()}`;
    const agentMsgId = `agent-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        sender: 'user',
        module,
        text: q,
        timestamp: new Date(),
      },
    ]);

    setCurrentStatus('ANALYZING');

    try {
      const queued = await intelligenceApi.ask(q, module);
      const source = new EventSource(`/api/v1/intelligence/questions/${queued.runId}/events`, { withCredentials: true });
      sourceRef.current = source;

      source.addEventListener('status', (message) => {
        const payload = JSON.parse((message as MessageEvent).data) as { status: string };
        setCurrentStatus(payload.status);
      });

      source.addEventListener('complete', (message) => {
        const payload = JSON.parse((message as MessageEvent).data) as {
          status: string;
          answer?: string;
          evidence?: Evidence[];
          limitations?: string[];
          errorCode?: string;
          errorMessage?: string;
        };
        source.close();
        setCurrentStatus(null);

        if (payload.status === 'COMPLETED') {
          setMessages((prev) => [
            ...prev,
            {
              id: agentMsgId,
              sender: 'agent',
              module,
              text: payload.answer ?? 'Analysis completed. No additional summary was returned.',
              evidence: payload.evidence ?? [],
              limitations: payload.limitations ?? [],
              timestamp: new Date(),
            },
          ]);
        } else {
          const providerBudgetError = payload.errorCode === 'PROVIDER_BUDGET_EXCEEDED';
          const failureMessage = providerBudgetError
            ? 'LLM request could not be completed because the configured output-token budget exceeds the available provider budget.'
            : payload.errorCode ?? 'The analysis was stopped in accordance with safety and policy rules.';
          const providerDetail = payload.errorMessage?.trim().slice(0, 1600);
          showToast({
            kind: 'error',
            title: 'Advisor Analysis Stopped',
            message: providerDetail ? `${failureMessage} ${providerDetail}` : failureMessage,
          });
        }
      });

      source.onerror = () => {
        source.close();
        setCurrentStatus(null);
        showToast({ kind: 'error', title: 'Connection Interrupted', message: 'The intelligence stream disconnected. Please retry.' });
      };
    } catch (error) {
      setCurrentStatus(null);
      showToast({
        kind: 'error',
        title: 'Advisor Query Failed',
        message: error instanceof Error ? error.message : 'Please check system connectivity.',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        sender: 'agent',
        module,
        text: `Conversation cleared. Ready for your ${activeConfig.short} operational questions.`,
        timestamp: new Date(),
      },
    ]);
    setCurrentStatus(null);
  };

  // Reusable Main Chat Content Component
  const chatContent = (
    <div className="flex flex-col h-full w-full bg-card overflow-hidden">
      {/* Sleek Top Header */}
      <div className="flex items-center justify-between border-b border-border/80 bg-slate-50/90 px-4 py-3 dark:bg-slate-900/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-xs border border-slate-200/90 p-1.5 dark:bg-slate-800 dark:border-slate-700">
            <Image
              src="/synergy-favicon.png"
              alt="Synergy Logo"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-800" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground tracking-tight">Synergy Advisor</h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Snapshots
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium">
              Operational Decision Intelligence
            </p>
          </div>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clearChat}
            title="Clear conversation"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            title={isExpanded ? 'Minimize to corner' : 'Expand to center modal'}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setIsExpanded(false);
            }}
            title="Close"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Domain Selector & Navigation Bar */}
      <div className="border-b border-border/80 bg-muted/20 px-4 py-2.5 shrink-0 flex items-center justify-between gap-3">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#004a80] dark:text-blue-400" />
          Advisor Domain:
        </span>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsModuleDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-2 rounded-xl border border-border/80 px-3 py-1.5 text-xs font-semibold shadow-2xs transition-all hover:bg-opacity-90 ${activeConfig.badgeBg} ${activeConfig.badgeText}`}
          >
            <ActiveIcon className="h-3.5 w-3.5" />
            <span>{activeConfig.name}</span>
            <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
          </button>

          {isModuleDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-border bg-popover p-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Select Intelligence Domain
              </div>
              {(Object.keys(moduleConfig) as IntelligenceModule[])
                .filter((m) => m !== 'SYSTEM')
                .map((modKey) => {
                  const cfg = moduleConfig[modKey];
                  const ModIcon = cfg.icon;
                  const isSelected = module === modKey;
                  return (
                    <button
                      key={modKey}
                      type="button"
                      onClick={() => {
                        setModule(modKey);
                        setIsModuleDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-primary/10 text-primary font-bold'
                          : 'text-popover-foreground hover:bg-muted'
                      }`}
                    >
                      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${cfg.badgeBg} ${cfg.badgeText}`}>
                        <ModIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-xs">{cfg.name}</p>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 min-h-0">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          const msgConfig = moduleConfig[msg.module] || activeConfig;
          const MsgIcon = msgConfig.icon;

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in duration-200`}
            >
              {!isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800 mt-0.5">
                  <Image
                    src="/synergy-favicon.png"
                    alt="Synergy"
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                </div>
              )}

              <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end max-w-[85%] sm:max-w-[75%]' : 'items-start max-w-[92%] sm:max-w-[85%]'}`}>
                <div className="flex items-center gap-2 px-1">
                  {!isUser && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-foreground">
                      <MsgIcon className="h-3 w-3 text-[#004a80] dark:text-blue-400" />
                      {msgConfig.name}
                    </span>
                  )}
                  {isUser && (
                    <span className="text-[11px] font-bold text-muted-foreground">You</span>
                  )}
                  <span className="text-[10px] text-muted-foreground/70">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div
                  className={`relative group rounded-2xl px-4 py-3 leading-relaxed shadow-xs transition-all ${
                    isUser
                      ? 'bg-[#004a80] text-white rounded-tr-xs font-medium'
                      : 'bg-muted/40 border border-border/80 text-foreground rounded-tl-xs dark:bg-slate-900/60'
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap text-xs sm:text-sm">{msg.text}</p>
                  ) : (
                    <FormattedContent text={msg.text} />
                  )}

                  {/* Certified Supporting Evidence */}
                  {Array.isArray(msg.evidence) && msg.evidence.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-border/70">
                      <div className="flex items-center gap-1.5 mb-2">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Certified ERP Evidence (Read-only Snapshot)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {msg.evidence.map((item, idx) => (
                          <span
                            key={item.metricKey ? `${item.metricKey}:${idx}` : idx}
                            title={describeEvidence(item).title}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-card px-2.5 py-1 text-[11px] font-medium text-slate-800 shadow-2xs hover:border-[#004a80] transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            <ShieldCheck className="h-3 w-3 text-[#004a80] dark:text-blue-400" />
                            {describeEvidence(item).label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Keep important caveats available without a large alert panel. */}
                  {Array.isArray(msg.limitations) && msg.limitations.length > 0 && (
                    <details className="mt-3 rounded-xl border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                      <summary className="cursor-pointer font-semibold text-foreground">Limitations ({msg.limitations.length})</summary>
                      <p className="mt-2 leading-relaxed">{msg.limitations.join(' · ')}</p>
                    </details>
                  )}

                  {/* Copy Response Button */}
                  {!isUser && (
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="absolute -right-2 -top-2 hidden group-hover:flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground hover:scale-105 active:scale-95 transition-all"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Live Analysis in Progress */}
        {currentStatus && (
          <div className="flex gap-3 items-start animate-in fade-in duration-200">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800 animate-pulse">
              <Image
                src="/synergy-favicon.png"
                alt="Synergy"
                width={20}
                height={20}
                className="object-contain"
              />
            </div>
            <div className="flex flex-col gap-1.5 max-w-[85%]">
              <span className="text-[11px] font-bold text-muted-foreground">{activeConfig.short} Advisor</span>
              <div className="rounded-2xl rounded-tl-xs border border-blue-200/80 bg-blue-50/50 p-3.5 text-xs text-slate-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-slate-200">
                <div className="flex items-center gap-2 font-semibold text-[#004a80] dark:text-blue-400">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#004a80]" />
                  </span>
                  <span>Evaluating: {currentStatus}...</span>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Running deterministic snapshot validation with zero autonomous database mutations.
                </p>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions Row */}
      {activeConfig.prompts.length > 0 && (
        <div className="border-t border-border/70 bg-muted/10 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">
              Suggestions:
            </span>
            {activeConfig.prompts.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => void handleSend(p.query)}
                className="shrink-0 rounded-full border border-border/80 bg-card px-3 py-1 text-[11px] font-medium text-foreground transition-all hover:border-[#004a80] hover:bg-[#004a80]/5 hover:text-[#004a80] active:scale-95 dark:hover:border-blue-400 dark:hover:text-blue-300"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Redesigned Input Panel */}
      <div className="border-t border-border/80 bg-card p-3 sm:p-4 shrink-0">
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void handleSend();
          }}
          className="relative flex flex-col gap-2 rounded-2xl border border-border/80 bg-muted/20 dark:bg-slate-900/40 p-2.5 transition-all duration-200 focus-within:border-[#004a80] focus-within:bg-background focus-within:ring-2 focus-within:ring-[#004a80]/15"
        >
          <textarea
            ref={textareaRef}
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${activeConfig.short} Advisor (e.g. inventory risk, bulk buy tradeoff, margin leakages)...`}
            rows={isExpanded ? 2 : 1}
            maxLength={2000}
            className="w-full resize-none border-0 bg-transparent px-1 py-0.5 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none max-h-32 leading-relaxed"
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              Press <kbd className="rounded border border-border px-1 py-0.5 text-[9px] font-mono">Enter</kbd> to send, <kbd className="rounded border border-border px-1 py-0.5 text-[9px] font-mono">Shift+Enter</kbd> for line
            </span>

            <button
              type="submit"
              disabled={Boolean(currentStatus) || inputQuestion.trim().length < 1}
              aria-label="Send query"
              className="flex h-8 w-8 sm:h-9 sm:w-9 ml-auto items-center justify-center rounded-xl bg-[#004a80] text-white shadow-sm transition-all hover:bg-[#003862] hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>

        <div className="mt-2.5 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Read-only verified snapshots · 0 DB mutations
          </span>
          <Link
            href="/intelligence"
            className="flex items-center gap-1 font-semibold text-[#004a80] dark:text-blue-400 hover:underline"
          >
            Intelligence Hub <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Professional Floating Launcher Button (Icon Only, Bottom-Right) */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center">
        <button
          type="button"
          onClick={() => {
            if (isOpen && isExpanded) {
              setIsExpanded(false);
            } else {
              setIsOpen((prev) => !prev);
            }
          }}
          aria-label={isOpen ? 'Close Synergy Advisor' : 'Open Synergy Advisor'}
          title="Synergy AI Advisor"
          className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700/80 shadow-xl shadow-slate-900/10 hover:shadow-2xl hover:shadow-[#004a80]/20 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          {isOpen && !isExpanded ? (
            <X className="h-6 w-6 text-slate-700 dark:text-slate-200 transition-transform group-hover:rotate-90 duration-200" />
          ) : (
            <>
              <div className="relative flex h-8 w-8 items-center justify-center">
                <Image
                  src="/synergy-favicon.png"
                  alt="Synergy Logo"
                  width={28}
                  height={28}
                  className="object-contain transition-transform duration-200 group-hover:scale-110"
                />
              </div>
              {/* Live Indicator Pulse Dot */}
              <span className="absolute bottom-1.5 right-1.5 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 bg-emerald-500" />
              </span>
            </>
          )}
        </button>
      </div>

      {/* Standard Bottom-Right Floating Popup (When Opened and NOT Expanded) */}
      {isOpen && !isExpanded && (
        <div
          style={{ bottom: '88px', right: '24px' }}
          className="fixed z-50 flex flex-col rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-card shadow-2xl backdrop-blur-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden w-[440px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-7.5rem)] animate-in fade-in slide-in-from-bottom-4 duration-200"
        >
          {chatContent}
        </div>
      )}

      {/* Expanded Mode: Center Huge Pop-up Modal */}
      {isOpen && isExpanded && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl h-[86vh] max-h-[850px] bg-card rounded-3xl border border-border shadow-2xl ring-1 ring-black/10 dark:ring-white/10 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
          >
            {chatContent}
          </div>
        </div>
      )}
    </>
  );
}
