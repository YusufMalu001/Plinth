import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Box, Users } from 'lucide-react';
import { BRAND } from '../content/products';

export const AboutPage: React.FC = () => {
  return (
    <div className="bg-page min-h-screen py-10">
      <Helmet>
        <title>About Us — {BRAND.name}</title>
        <meta
          name="description"
          content="Learn why we built Plinth: providing an unyielding foundation for operational businesses that make, move, and sell."
        />
        <link rel="canonical" href="https://plinth.erp/about" />
      </Helmet>

      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-xs uppercase tracking-wider text-ink-muted mb-4">
            <Box className="w-3.5 h-3.5 text-accent" />
            <span>The Plinth Philosophy</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-ink mb-6 font-sans">
            A plinth is the heavy stone block upon which a structure stands.
          </h1>
          <p className="text-lg text-ink-secondary leading-relaxed">
            In classical architecture, the plinth distributes immense weight evenly, keeping columns upright through seismic shift and heavy weather. Modern physical industries need the exact same grounding for their operational data.
          </p>
        </div>

        {/* Narrative */}
        <div className="prose prose-neutral max-w-none text-ink text-sm sm:text-base leading-relaxed space-y-6 mb-16">
          <p>
            For decades, industrial enterprises have been caught in a false dichotomy. On one side are monolithic ERP systems: bloated with multi-million dollar consultant fees, decade-old user interfaces, and six-month release cycles. On the other side are spreadsheets and fragmented point applications: fragile, disconnected, and lacking ledger integrity.
          </p>
          <p>
            When operations run on spreadsheets, accountability slips. Inventory records drift from physical shop floor reality, production BOMs exist in supervisors&apos; notebooks, and dispatch happens without real-time credit verification.
          </p>
          <p>
            Plinth was engineered as a third path: <strong>structured operations with accountable output</strong>. We take the strict double-entry ledger rigor of enterprise software and wrap it in a lightweight, modern interface that shop floor technicians, storekeepers, and plant heads can operate without extensive training.
          </p>
        </div>

        {/* Three Core Principles */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <div className="bg-surface border border-border rounded-xl p-6 shadow-popover">
            <span className="text-xs text-ink-muted uppercase tracking-wider block mb-2">Principle 01</span>
            <h2 className="text-base font-bold text-ink mb-2">Ledger-Backed Rigor</h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Every inventory change requires equal debit and credit location entries. No silent balance overrides.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-6 shadow-popover">
            <span className="text-xs text-ink-muted uppercase tracking-wider block mb-2">Principle 02</span>
            <h2 className="text-base font-bold text-ink mb-2">Role Safety & Audit</h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Every operational action is tied to an authenticated role and recorded permanently in the audit log.
            </p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-6 shadow-popover">
            <span className="text-xs text-ink-muted uppercase tracking-wider block mb-2">Principle 03</span>
            <h2 className="text-base font-bold text-ink mb-2">Grounded AI</h2>
            <p className="text-xs text-ink-secondary leading-relaxed">
              AI should draft and summarize work, not make unchecked autonomous writes. Previews always precede commits.
            </p>
          </div>
        </div>

        {/* Founder & Team Section */}
        <div className="bg-surface rounded-2xl border border-border p-8 mb-16 shadow-popover">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-5 h-5 text-ink-secondary" />
            <span className="text-xs uppercase tracking-wider text-ink-muted">Leadership & Team</span>
          </div>
          <h2 className="text-2xl font-bold text-ink mb-4">Engineering Foundations</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
            {/* Founder 1 Placeholder */}
            <div className="bg-muted border border-border rounded-xl p-6">
              <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center text-ink-secondary text-xs mb-4">
                PHOTO
              </div>
              <h3 className="text-base font-bold text-ink mb-1">Founding Engineering Team</h3>
              <p className="text-xs text-ink-muted mb-3 uppercase tracking-wider">Industrial Systems & Product</p>
              <p className="text-xs text-ink-secondary leading-relaxed">
                {/* TODO: Add photo and bio */}
                Engineering leaders with backgrounds in distributed enterprise infrastructure, factory floor automation, and modern web application development.
              </p>
            </div>

            {/* Founder 2 Placeholder */}
            <div className="bg-muted border border-border rounded-xl p-6">
              <div className="w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center text-ink-secondary text-xs mb-4">
                PHOTO
              </div>
              <h3 className="text-base font-bold text-ink mb-1">Operations & Domain Practice</h3>
              <p className="text-xs text-ink-muted mb-3 uppercase tracking-wider">Manufacturing Operations</p>
              <p className="text-xs text-ink-secondary leading-relaxed">
                {/* TODO: Add photo and bio */}
                Domain veterans with direct plant management experience across discrete fabrication, supply chain logistics, and production scheduling.
              </p>
            </div>
          </div>
        </div>

        {/* Call to action */}
        <div className="bg-muted border border-border rounded-xl p-8 text-center shadow-popover">
          <h2 className="text-2xl font-bold text-ink mb-2">Work with us</h2>
          <p className="text-sm text-ink-secondary mb-6 max-w-xl mx-auto">
            We are partnering with select industrial manufacturers and distributors to standardize operational software.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button"
          >
            Connect with our team
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};
