import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  Layers, 
  ArrowRight, 
  Lock, 
  History, 
  UserCheck, 
  CheckCircle2, 
  Database,
  Sparkles
} from 'lucide-react';
import { BRAND } from '../content/products';
import { InteractivePlatformLayers } from '../components/InteractivePlatformLayers';

export const PlatformPage: React.FC = () => {
  return (
    <div className="bg-canvas min-h-screen py-16">
      <Helmet>
        <title>Shared Platform & Architecture — Plinth</title>
        <meta
          name="description"
          content="The shared platform powering all Plinth editions: immutable ledger inventory core, AI operator safety model, role-based access, and integrations."
        />
        <link rel="canonical" href="https://plinth.erp/platform" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-raised border border-border text-xs font-mono uppercase tracking-wider text-muted mb-4">
            <Layers className="w-3.5 h-3.5 text-accent" />
            <span>Underlying Architecture</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-ink mb-6 font-sans">
            One immutable base. Specialized execution layers.
          </h1>
          <p className="text-lg text-muted leading-relaxed">
            Every Plinth edition is powered by the same underlying operational foundation: double-entry inventory mechanics, auditable governance, and safety-gated intelligence.
          </p>
        </div>

        {/* 1. The 4 Layers in Detail */}
        <div className="mb-20">
          <h2 className="text-2xl font-bold text-ink mb-4">The Four Architectural Layers</h2>
          <p className="text-sm text-muted mb-8 max-w-2xl">
            Explore how data flows through system verification before touching the ledger.
          </p>
          <InteractivePlatformLayers />
        </div>

        {/* 2. AI Operator Safety Model */}
        <div className="bg-surface rounded-2xl border border-border p-8 sm:p-12 mb-20 shadow-card">
          <div className="max-w-3xl mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-raised border border-border text-xs font-mono uppercase tracking-wider text-muted mb-3">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>Safety Specification</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-4">
              AI Operator Safety & Boundary Model
            </h2>
            <p className="text-base text-muted leading-relaxed">
              {BRAND.aiClaim}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-surface-raised border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center text-ink mb-4">
                <CheckCircle2 className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-base font-bold text-ink mb-2">1. Explicit Preview First</h3>
              <p className="text-xs text-muted leading-relaxed">
                The operator never commits write operations autonomously. Every change is structured into a human-readable draft showing exactly which records, quantities, and ledger accounts will update.
              </p>
            </div>

            <div className="bg-surface-raised border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center text-ink mb-4">
                <UserCheck className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-base font-bold text-ink mb-2">2. Strictly Role-Scoped</h3>
              <p className="text-xs text-muted leading-relaxed">
                The AI inherits only the permissions of the authenticated user. A warehouse associate cannot draft accounting journals, and a procurement specialist cannot modify production BOMs.
              </p>
            </div>

            <div className="bg-surface-raised border border-border rounded-xl p-6">
              <div className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center text-ink mb-4">
                <History className="w-5 h-5 text-accent" />
              </div>
              <h3 className="text-base font-bold text-ink mb-2">3. Immutable Audit Trail</h3>
              <p className="text-xs text-muted leading-relaxed">
                Both the original natural-language prompt and the generated operational diff are stored permanently with timestamps, user session keys, and approval metadata.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Security & Governance Trust Factors */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div className="bg-surface rounded-xl border border-border p-6 shadow-card">
            <div className="w-10 h-10 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-ink mb-4">
              <Lock className="w-5 h-5 text-ink" />
            </div>
            <h3 className="text-base font-bold text-ink mb-2">Data Encrypted in Transit & Rest</h3>
            <p className="text-xs text-muted leading-relaxed">
              All client communications traverse TLS 1.3 tunnels. Operational databases and audit logs reside on encrypted enterprise storage volumes with continuous backups.
            </p>
          </div>

          <div className="bg-surface rounded-xl border border-border p-6 shadow-card">
            <div className="w-10 h-10 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-ink mb-4">
              <UserCheck className="w-5 h-5 text-ink" />
            </div>
            <h3 className="text-base font-bold text-ink mb-2">Granular Role-Based Access</h3>
            <p className="text-xs text-muted leading-relaxed">
              Define discrete permissions per department, warehouse location, and approval threshold. Segregate duties across procurement, dispatch, and quality teams.
            </p>
          </div>

          <div className="bg-surface rounded-xl border border-border p-6 shadow-card">
            <div className="w-10 h-10 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-ink mb-4">
              <Database className="w-5 h-5 text-ink" />
            </div>
            <h3 className="text-base font-bold text-ink mb-2">Double-Entry Stock Ledger</h3>
            <p className="text-xs text-muted leading-relaxed">
              Stock cannot be arbitrarily overwritten. Every movement requires a debit from a source location and a credit to a destination, ensuring exact reconciliation.
            </p>
          </div>
        </div>

        {/* 4. Integrations: Supported vs Planned */}
        <div className="bg-surface rounded-2xl border border-border p-8 mb-20 shadow-card">
          <div className="max-w-2xl mb-8">
            <span className="text-xs font-mono uppercase tracking-wider text-muted block mb-1">Ecosystem</span>
            <h2 className="text-2xl font-bold text-ink mb-2">Integrations Roadmap</h2>
            <p className="text-sm text-muted">
              Clear visibility into supported systems and connections actively scheduled.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Supported */}
            <div className="bg-surface-raised rounded-xl border border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-semantic-success" />
                <h3 className="text-base font-bold text-ink">Supported & Active</h3>
              </div>
              <ul className="space-y-3">
                {[
                  { name: 'Tally Prime', desc: 'Automated 2-way sync for sales, purchases, vouchers, and ledgers.' },
                  { name: 'Excel / CSV Import & Export', desc: 'Structured migration templates with column mapping and schema validation.' },
                  { name: 'REST Webhooks API', desc: 'Secure programmatic hooks for triggering external events and real-time alerts.' },
                ].map((item) => (
                  <li key={item.name} className="p-3 bg-surface rounded-lg border border-border">
                    <span className="text-xs font-bold font-mono text-ink block mb-0.5">{item.name}</span>
                    <span className="text-xs text-muted leading-relaxed">{item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Planned */}
            <div className="bg-surface-raised rounded-xl border border-border p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2.5 h-2.5 rounded-full bg-semantic-neutral" />
                <h3 className="text-base font-bold text-ink">Planned on Roadmap</h3>
              </div>
              <ul className="space-y-3">
                {[
                  { name: 'Government E-Invoice & E-Way Bill Portal', desc: 'Direct NIC API integration for automated IRN and EWB generation.' },
                  { name: 'WhatsApp Business API', desc: 'Automated dispatch notifications, PO approvals, and customer order updates.' },
                  { name: 'IoT Weighbridge & Scale Connectors', desc: 'Direct serial/Ethernet telemetry ingestion for bulk material inbound/outbound.' },
                ].map((item) => (
                  <li key={item.name} className="p-3 bg-surface rounded-lg border border-border">
                    <span className="text-xs font-bold font-mono text-ink block mb-0.5">{item.name}</span>
                    <span className="text-xs text-muted leading-relaxed">{item.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* 5. How Onboarding Works (Designed to go live in days) */}
        <div className="bg-surface-raised rounded-2xl border border-border p-8 sm:p-12 mb-16 shadow-card">
          <div className="max-w-2xl mb-10">
            <span className="text-xs font-mono uppercase tracking-wider text-muted block mb-1">Implementation</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink mb-3">Designed to go live in days, not quarters</h2>
            <p className="text-sm text-muted leading-relaxed">
              Traditional ERP rollouts stall because of heavy customization cycles. Plinth standardizes the base core so you configure only your items, vendors, and workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { day: 'Day 01', title: 'Data Extraction & Schema Mapping', desc: 'Import your master items, BOMs, vendors, and opening stock balances using clean CSV/Excel templates.' },
              { day: 'Day 02', title: 'Plant Roles & Approval Rules', desc: 'Configure user teams, plant locations, PO approval ceilings, and inspection checklists.' },
              { day: 'Day 03', title: 'Dry Run & Team Walkthrough', desc: 'Run simulated procurement, production issue, and dispatch cycles with your floor leads.' },
              { day: 'Day 04+', title: 'Parallel Run to Full Cutover', desc: 'Issue live orders with double verification. Tally sync activates smoothly without ledger mismatch.' },
            ].map((step) => (
              <div key={step.day} className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-mono text-muted uppercase tracking-wider block mb-2">{step.day}</span>
                  <h3 className="text-sm font-bold text-ink mb-2">{step.title}</h3>
                  <p className="text-xs text-muted leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center py-8">
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button"
          >
            Schedule platform walk-through
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};
