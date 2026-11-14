import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ShieldCheck, History, Lock, ArrowRight } from 'lucide-react';
import { HomeHeroInteractive } from '../components/HomeHeroInteractive';
import { InteractivePlatformLayers } from '../components/InteractivePlatformLayers';
import { InteractiveModuleExplorer } from '../components/InteractiveModuleExplorer';
import { FaqAccordion } from '../components/FaqAccordion';
import { StatusPill } from '../components/StatusPill';
import { DynamicIcon } from '../components/DynamicIcon';
import { PRODUCTS, BRAND_COPY, PRICING_FROM } from '../content/products';

export const HomePage: React.FC = () => {
  const [selectedEditionSlug, setSelectedEditionSlug] = useState('manufacturing');
  const selectedProduct = PRODUCTS.find((p) => p.slug === selectedEditionSlug) || PRODUCTS[0];

  const manufacturingFaqs = PRODUCTS[0].faqs;

  return (
    <>
      <Helmet>
        <title>Plinth — Industrial Cloud ERP</title>
        <meta
          name="description"
          content="The operations platform for businesses that make, move and sell. Structured operations with an accountable AI operator."
        />
        <link rel="canonical" href="https://plintherp.com/" />
      </Helmet>

      {/* 1. Hero Section */}
      <section className="pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 max-w-content mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted border border-border text-xs font-mono font-medium text-ink-secondary mb-6">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span>Industrial Cloud ERP &bull; 2026 Production Edition</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-semibold tracking-[-0.01em] text-ink max-w-4xl mx-auto leading-[1.1] mb-6">
          {BRAND_COPY.masterHeadline}
        </h1>

        <p className="text-lg sm:text-xl text-ink-secondary max-w-2xl mx-auto leading-relaxed mb-8">
          {BRAND_COPY.masterSubline}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16">
          <Link
            to="/demo"
            className="w-full sm:w-auto inline-flex items-center justify-center h-11 px-6 rounded-md bg-inverse text-ink-inverse text-sm font-semibold hover:bg-ink-secondary/90 transition-colors"
          >
            Book a demo
          </Link>
          <Link
            to="/products"
            className="w-full sm:w-auto inline-flex items-center justify-center h-11 px-6 rounded-md bg-muted text-ink text-sm font-semibold hover:bg-hover transition-colors"
          >
            Explore products
          </Link>
        </div>

        {/* Hero Interactive Simulated AI Operator Card */}
        <HomeHeroInteractive />
      </section>

      {/* 2. Trust Strip */}
      <section className="border-y border-border bg-muted/30 py-6 px-4 sm:px-6">
        <div className="max-w-content mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          <div className="flex items-center justify-center gap-2.5 text-xs sm:text-sm font-semibold text-ink font-mono">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>Role-based access</span>
          </div>
          <div className="flex items-center justify-center gap-2.5 text-xs sm:text-sm font-semibold text-ink font-mono">
            <History className="w-4 h-4 text-accent" />
            <span>Full audit trail</span>
          </div>
          <div className="flex items-center justify-center gap-2.5 text-xs sm:text-sm font-semibold text-ink font-mono">
            <Lock className="w-4 h-4 text-accent" />
            <span>Data encrypted in transit</span>
          </div>
        </div>
      </section>

      {/* 3. Editions Explorer */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-content mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
            Specialized By Operational Domain
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mt-2 mb-4">
            Six focused editions. One architectural backbone.
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary">
            Select an edition to inspect domain workflows, modules, and dispatch parameters.
          </p>
        </div>

        {/* Tab row */}
        <div className="flex items-center justify-start sm:justify-center overflow-x-auto gap-2 pb-4 mb-8">
          {PRODUCTS.map((prod) => {
            const isSelected = prod.slug === selectedEditionSlug;
            return (
              <button
                key={prod.slug}
                type="button"
                onClick={() => setSelectedEditionSlug(prod.slug)}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 border ${
                  isSelected
                    ? 'bg-surface border-accent text-ink shadow-popover font-semibold'
                    : 'bg-muted/40 border-border text-ink-secondary hover:text-ink hover:bg-hover'
                }`}
              >
                <span>{prod.shortName}</span>
                <StatusPill status={prod.status} />
              </button>
            );
          })}
        </div>

        {/* Active edition preview card */}
        <div className="bg-surface border border-border rounded-xl p-6 sm:p-8 shadow-popover">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-6 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl sm:text-2xl font-bold text-ink">{selectedProduct.name}</h3>
                <StatusPill status={selectedProduct.status} />
              </div>
              <p className="text-sm font-medium text-ink-secondary mt-1">{selectedProduct.tagline}</p>
            </div>
            <Link
              to={`/products/${selectedProduct.slug}`}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-inverse text-ink-inverse text-xs font-semibold hover:bg-ink-secondary/90 transition-colors"
            >
              <span>Explore {selectedProduct.shortName} Edition</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <p className="text-sm text-ink-secondary leading-relaxed mb-6">
            {selectedProduct.summary}
          </p>

          <div>
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted block mb-3">
              Included Core Modules
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {selectedProduct.modules.slice(0, 4).map((mod) => (
                <div
                  key={mod.name}
                  className="p-3.5 rounded-lg bg-muted/30 border border-border flex flex-col justify-between"
                >
                  <div className="flex items-center gap-2 mb-2 text-ink">
                    <DynamicIcon name={mod.iconName} size={16} />
                    <span className="text-xs font-bold">{mod.name}</span>
                  </div>
                  <p className="text-xs text-ink-secondary">{mod.benefit}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Platform Architecture Section: "One base, every operation" */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 bg-muted/30 border-y border-border">
        <div className="max-w-content mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
              Unified Platform
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mt-2 mb-4">
              One base, every operation
            </h2>
            <p className="text-sm sm:text-base text-ink-secondary">
              An interactive 4-layer architecture ensuring strict ledger integrity, seamless external synchronization, and role-guarded AI execution.
            </p>
          </div>

          <InteractivePlatformLayers />
        </div>
      </section>

      {/* 5. How It Works: 3 Steps */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-content mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
            Implementation &amp; Adoption
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mt-2 mb-4">
            How Plinth goes live in days
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary">
            Engineered to bypass multi-month ERP consultancy delays. Designed to go live in days.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="p-6 rounded-xl border border-border bg-surface shadow-popover space-y-3">
            <div className="w-8 h-8 rounded-lg bg-muted border border-border font-mono text-sm font-bold text-ink flex items-center justify-center">
              01
            </div>
            <h3 className="text-base font-bold text-ink">Bring your data</h3>
            <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
              Upload existing spreadsheets of items, vendors, BOM structures, and opening balances. Automated schema validation sanitizes records instantly.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-surface shadow-popover space-y-3">
            <div className="w-8 h-8 rounded-lg bg-muted border border-border font-mono text-sm font-bold text-ink flex items-center justify-center">
              02
            </div>
            <h3 className="text-base font-bold text-ink">Go live in days</h3>
            <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
              Designed to go live in days. Configure role-based permissions, link your accounting ledger, and issue live work orders without custom engineering.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-border bg-surface shadow-popover space-y-3">
            <div className="w-8 h-8 rounded-lg bg-muted border border-border font-mono text-sm font-bold text-ink flex items-center justify-center">
              03
            </div>
            <h3 className="text-base font-bold text-ink">Run it by asking</h3>
            <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
              {BRAND_COPY.aiOperatorClaim}
            </p>
          </div>
        </div>
      </section>

      {/* 6. Module Explorer Section */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 bg-muted/30 border-y border-border">
        <div className="max-w-content mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
              Deep Industrial Execution
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mt-2 mb-4">
              Explore core operational modules
            </h2>
            <p className="text-sm sm:text-base text-ink-secondary">
              Click any module to inspect its live data views, inventory state transitions, and audit controls.
            </p>
          </div>

          <InteractiveModuleExplorer />
        </div>
      </section>

      {/* 7. Numbers / Proof Placeholder (Honesty Rule compliant) */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-content mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
            Validation &amp; Co-Design
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mt-2 mb-4">
            Production proof in progress
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary">
            We do not publish fabricated logos, artificial statistics, or unverified claims. We are actively deploying with industrial design partners.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-8 rounded-xl border border-border bg-surface text-center space-y-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
              Metal Fabrication
            </span>
            <div className="text-base font-bold text-ink">Case study coming soon</div>
            <p className="text-xs text-ink-secondary">Full shop-floor BOM costing and cutting optimization review.</p>
          </div>

          <div className="p-8 rounded-xl border border-border bg-surface text-center space-y-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
              Plastics &amp; Extrusions
            </span>
            <div className="text-base font-bold text-ink">Case study coming soon</div>
            <p className="text-xs text-ink-secondary">Granule batch issue, mold runtime logging, and regrind scrap ledger.</p>
          </div>

          <div className="p-8 rounded-xl border border-border bg-surface text-center space-y-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
              Multi-Depot Distribution
            </span>
            <div className="text-base font-bold text-ink">Case study coming soon</div>
            <p className="text-xs text-ink-secondary">E-way bill automated dispatch staging and dealer credit limits.</p>
          </div>
        </div>

        <div className="text-center">
          <Link
            to="/demo"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-link hover:underline"
          >
            <span>Be our design partner &rarr;</span>
          </Link>
        </div>
      </section>

      {/* 8. Pricing Teaser */}
      <section className="py-20 sm:py-24 px-4 sm:px-6 bg-muted/40 border-y border-border">
        <div className="max-w-content mx-auto text-center max-w-2xl">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
            Predictable Economics
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mt-2 mb-3">
            {BRAND_COPY.pricingClaim}
          </h2>
          <p className="text-sm text-ink-secondary mb-6">
            Never pay per-seat licenses for plant managers, shift supervisors, machine operators, or accountants.
          </p>

          <div className="p-6 rounded-xl border border-border bg-surface shadow-popover mb-8 text-left sm:text-center">
            <div className="text-xs font-mono text-ink-muted uppercase tracking-wider">
              Plinth Manufacturing Subscription
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-ink mt-1 mb-2">
              From ₹{PRICING_FROM.amount.toLocaleString('en-IN')} per {PRICING_FROM.cadence}
            </div>
            <p className="text-xs text-ink-secondary max-w-md mx-auto">
              Includes full core manufacturing, inventory, quality, dispatch modules, Tally accounting sync, and the audited AI operator.
            </p>
          </div>

          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-link hover:underline"
          >
            <span>Review full pricing breakdown &rarr;</span>
          </Link>
        </div>
      </section>

      {/* 9. FAQ Accordion */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <span className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-muted">
            Frequently Asked Questions
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink mt-2">
            Answers for operational leaders
          </h2>
        </div>

        <FaqAccordion items={manufacturingFaqs} />
      </section>

      {/* 10. Final Call to Action */}
      <section className="py-20 px-4 sm:px-6 border-t border-border bg-surface text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Bring operational certainty to your plant
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary">
            Schedule a practical walkthrough customized to your bill of materials and shop floor routing.
          </p>
          <div className="pt-2">
            <Link
              to="/demo"
              className="inline-flex items-center justify-center h-11 px-8 rounded-md bg-inverse text-ink-inverse text-sm font-semibold hover:bg-ink-secondary/90 transition-colors"
            >
              Book a demo
            </Link>
          </div>
        </div>
      </section>
    </>
  );
};
