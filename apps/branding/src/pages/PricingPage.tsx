import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Check, ArrowRight } from 'lucide-react';
import { PRICING_FROM } from '../content/products';
import { FaqAccordion } from '../components/FaqAccordion';

export const PricingPage: React.FC = () => {
  const [plantCount, setPlantCount] = useState<number>(1);
  const baseMonthly = PRICING_FROM.amount;
  const estimatedMonthly = plantCount * baseMonthly;

  const manufacturingFaqs = [
    {
      question: 'Why flat pricing per plant instead of per user?',
      answer: 'Per-user fees discourage shops from putting machine operators, storekeepers, and dispatch clerks into the system, leading to offline paperwork. A plant subscription allows every person on the floor to be accountable.',
    },
    {
      question: 'Are there hidden implementation or setup charges?',
      answer: 'Setup is straightforward with standard CSV/Excel import templates. We provide guided onboarding assistance during your initial setup period.',
    },
    {
      question: 'What is counted as a "plant" or "facility"?',
      answer: 'A single physical manufacturing unit, warehouse, or campus operating under a unified location address. Additional distinct manufacturing plants require their own plant license.',
    },
    {
      question: 'Can we switch from monthly to annual billing?',
      answer: 'Yes, annual commitments receive preferential terms. Contact our operations team during demo booking for full billing schedules.',
    },
  ];

  return (
    <div className="bg-canvas min-h-screen py-16">
      <Helmet>
        <title>Pricing — Plinth Industrial Cloud ERP</title>
        <meta
          name="description"
          content="Predictable industrial ERP pricing: flat monthly subscription per plant, not per user. Transparent, scalable, and audit-ready."
        />
        <link rel="canonical" href="https://plinth.erp/pricing" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-raised border border-border text-xs font-mono uppercase tracking-wider text-muted mb-4">
            <span>Predictable Operations Billing</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-ink mb-4 font-sans">
            Flat monthly subscription per plant. Not per user.
          </h1>
          <p className="text-lg text-muted leading-relaxed">
            Every operator, storekeeper, and manager on your factory floor deserves access to the system of record without seat penalty penalties.
          </p>
        </div>

        {/* Pricing Card: Manufacturing */}
        <div className="max-w-3xl mx-auto bg-surface rounded-2xl border-2 border-border-strong p-8 sm:p-12 mb-16 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-muted block mb-1">Standard Edition</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-ink">Plinth Manufacturing</h2>
            </div>
            <span className="inline-flex px-3 py-1 rounded-full text-xs font-mono font-medium bg-semantic-success-light text-semantic-success-dark">
              Available Now
            </span>
          </div>

          <p className="text-sm text-muted mb-8 leading-relaxed">
            Full operational control for metal fabrication, plastics, garments, and made-to-order manufacturing units.
          </p>

          {/* Price display */}
          <div className="p-6 bg-surface-raised border border-border rounded-xl mb-8 flex flex-col sm:flex-row items-baseline sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-mono uppercase text-muted">From</span>
                <span className="text-4xl font-extrabold text-ink font-sans">
                  ₹{PRICING_FROM.amount.toLocaleString('en-IN')}
                </span>
                <span className="text-sm text-muted">/ plant / month</span>
              </div>
              <p className="text-xs font-mono text-subtle mt-1">Billed per active manufacturing plant.</p>
            </div>
            <Link
              to="/demo?edition=manufacturing"
              className="w-full sm:w-auto px-6 py-3 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button text-center"
            >
              Book a live demo
            </Link>
          </div>

          {/* Plant estimator interactive slider */}
          <div className="mb-8 p-5 bg-canvas border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="font-semibold text-ink">Estimate for your facility footprint:</span>
              <span className="font-mono text-muted">{plantCount} {plantCount === 1 ? 'Plant' : 'Plants'}</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={plantCount}
              onChange={(e) => setPlantCount(parseInt(e.target.value, 10))}
              aria-label="Number of manufacturing plants"
              className="w-full accent-inverse cursor-pointer"
            />
            <div className="flex justify-between items-center text-xs font-mono text-muted mt-2">
              <span>1 plant</span>
              <span className="font-bold text-ink">
                Estimated ₹{estimatedMonthly.toLocaleString('en-IN')}/mo
              </span>
              <span>10+ plants</span>
            </div>
          </div>

          {/* What is included */}
          <div className="space-y-4">
            <h3 className="text-xs font-mono uppercase tracking-wider text-muted">Everything Included in Plant License:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-ink">
              {[
                'Full procurement lifecycle (Requisition to PO & GRN)',
                'Multi-location inventory with batch/lot control',
                'Production execution with BOMs & material issue',
                'Inspection checklists & quality verification',
                'Sales orders, dispatch challans & tax invoices',
                'Job work tracking (material out & return reconciliation)',
                'Two-way Tally Prime integration',
                'Plinth AI Operator with preview & role safety',
                'Complete audit trail of all transactions',
                'Role-based permission controls',
              ].map((feat) => (
                <div key={feat} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coming soon editions notice */}
        <div className="max-w-3xl mx-auto bg-surface-raised border border-border rounded-xl p-8 mb-16 text-center">
          <h2 className="text-lg font-bold text-ink mb-2">Looking for other editions?</h2>
          <p className="text-sm text-muted mb-4 max-w-xl mx-auto">
            Plinth Provenance, Trade, Build, Fleet, and Campus editions are in active deployment with early design partners.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink hover:text-accent font-mono uppercase tracking-wider"
          >
            Apply to become a design partner <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Pricing FAQs */}
        <div className="max-w-3xl mx-auto bg-surface rounded-2xl border border-border p-8 shadow-card">
          <h2 className="text-xl font-bold text-ink mb-6">Pricing & Licensing FAQs</h2>
          <FaqAccordion items={manufacturingFaqs} />
        </div>
      </div>
    </div>
  );
};
