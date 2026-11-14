import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertTriangle, ChevronRight } from 'lucide-react';

interface LegalPageProps {
  type: 'privacy' | 'terms';
}

export const LegalPage: React.FC<LegalPageProps> = ({ type }) => {
  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';

  return (
    <div className="bg-page min-h-screen py-10">
      <Helmet>
        <title>{title} — Plinth</title>
        <meta name="description" content={`Plinth legal notice: ${title}.`} />
        <link rel="canonical" href={`https://plinth.erp/${type}`} />
      </Helmet>

      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center space-x-2 text-sm text-ink-placeholder">
          <Link to="/" className="hover:text-ink transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4 text-ink-secondary" />
          <span className="text-ink font-medium" aria-current="page">{title}</span>
        </nav>

        {/* Lawyer Review Required Notice */}
        <div className="bg-amber-bg border border-amber-solid text-amber-text rounded-xl p-4 sm:p-5 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold">Draft: have this reviewed by a lawyer before launch</h2>
            <p className="text-xs mt-1 leading-relaxed">
              This document is a placeholder template outlining operational terms and data collection boundaries. It must undergo formal legal scrutiny prior to commercial onboarding.
            </p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8 sm:p-12 shadow-popover">
          <h1 className="text-3xl font-bold text-ink mb-2">{title}</h1>
          <p className="text-xs text-ink-muted uppercase tracking-wider mb-8">
            Last Updated: November 2026 (Preliminary Draft)
          </p>

          <div className="prose prose-neutral max-w-none text-ink text-sm leading-relaxed space-y-6">
            {isPrivacy ? (
              <>
                <section>
                  <h2 className="text-base font-bold text-ink mb-2">1. Scope and Information Collected</h2>
                  <p className="text-ink-secondary">
                    Plinth collects organizational contact information (name, corporate email, phone number, company name, plant size) submitted through our demo request and waitlist forms. Within the ERP platform, transactional logs, audit histories, and user credentials are encrypted in transit and at rest.
                  </p>
                </section>

                <section>
                  <h2 className="text-base font-bold text-ink mb-2">2. Processing of Operational Data</h2>
                  <p className="text-ink-secondary">
                    We process operational data (inventory levels, production orders, vendor bills) strictly to provide and maintain the service under customer role permissions. We do not sell operational records or customer telemetry to external parties.
                  </p>
                </section>

                <section>
                  <h2 className="text-base font-bold text-ink mb-2">3. Storage and Data Retention</h2>
                  <p className="text-ink-secondary">
                    Enterprise data is retained for the active duration of the customer subscription agreement, plus any statutory audit retention window required by industrial and taxation regulations.
                  </p>
                </section>
              </>
            ) : (
              <>
                <section>
                  <h2 className="text-base font-bold text-ink mb-2">1. Platform License and Access</h2>
                  <p className="text-ink-secondary">
                    Subscriptions to Plinth are billed on a flat monthly rate per designated industrial facility (&quot;plant&quot;), granting access to the modules configured under that specific edition.
                  </p>
                </section>

                <section>
                  <h2 className="text-base font-bold text-ink mb-2">2. Role-Based Safety and Auditing</h2>
                  <p className="text-ink-secondary">
                    The customer is responsible for maintaining administrative role mappings and approval thresholds. All automated drafts created via the AI Operator require human preview and authorization prior to commit.
                  </p>
                </section>

                <section>
                  <h2 className="text-base font-bold text-ink mb-2">3. Service Levels and Availability</h2>
                  <p className="text-ink-secondary">
                    Plinth provides production system availability and standard backup frequencies detailed in customer master service agreements.
                  </p>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
