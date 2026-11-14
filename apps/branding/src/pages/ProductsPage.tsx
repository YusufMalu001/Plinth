import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, CheckCircle2, ChevronRight, Sparkles } from 'lucide-react';
import { PRODUCTS, BRAND } from '../content/products';
import { StatusPill } from '../components/StatusPill';
import { DynamicIcon } from '../components/DynamicIcon';

export const ProductsPage: React.FC = () => {
  return (
    <div className="bg-canvas min-h-screen py-16">
      <Helmet>
        <title>Products & Editions — Plinth Industrial Cloud ERP</title>
        <meta
          name="description"
          content="Explore all Plinth editions built on a unified system of record: Manufacturing, Provenance, Trade, Build, Fleet, and Campus."
        />
        <link rel="canonical" href="https://plinth.erp/products" />
      </Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center space-x-2 text-sm text-subtle">
          <Link to="/" className="hover:text-ink transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4 text-muted" />
          <span className="text-ink font-medium" aria-current="page">Products</span>
        </nav>

        {/* Page Header */}
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-raised border border-border text-xs font-mono uppercase tracking-wider text-muted mb-4">
            <span>{BRAND.descriptor}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-ink mb-4 font-sans">
            Specialized editions on one accountable foundation.
          </h1>
          <p className="text-lg text-muted leading-relaxed">
            Every Plinth edition shares the same ledger-backed inventory core, role-based safety permissions, audit trail, and AI operator. Choose the workflow specialized for your operational footprint.
          </p>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {PRODUCTS.map((product) => {
            const isAvailable = product.status === 'available';
            return (
              <div
                key={product.slug}
                className="bg-surface rounded-xl border border-border p-6 flex flex-col justify-between shadow-card hover:border-border-strong transition-all duration-200"
              >
                <div>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-ink">
                      <DynamicIcon name={product.modules[0]?.iconName || 'Layers'} className="w-6 h-6" />
                    </div>
                    <StatusPill status={product.status} />
                  </div>

                  <h2 className="text-xl font-bold text-ink mb-2">
                    <Link to={`/products/${product.slug}`} className="hover:text-accent focus:outline-none">
                      {product.name}
                    </Link>
                  </h2>
                  <p className="text-xs font-mono text-muted mb-3 uppercase tracking-wider">
                    {product.audience}
                  </p>
                  <p className="text-sm font-medium text-ink mb-2">
                    {product.tagline}
                  </p>
                  <p className="text-sm text-muted mb-6 leading-relaxed">
                    {product.summary}
                  </p>

                  {/* Modules preview */}
                  <div className="border-t border-border-subtle pt-4 mb-6">
                    <h3 className="text-xs font-mono text-muted uppercase tracking-wider mb-3">
                      Included Modules
                    </h3>
                    <ul className="space-y-2">
                      {product.modules.slice(0, 4).map((mod) => (
                        <li key={mod.name} className="flex items-start text-xs text-ink gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium">{mod.name}</span>
                            <span className="text-muted"> — {mod.benefit}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex items-center justify-between gap-3">
                  <Link
                    to={`/products/${product.slug}`}
                    className="inline-flex items-center text-sm font-semibold text-ink hover:text-accent transition-colors gap-1.5"
                  >
                    View details
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  {isAvailable ? (
                    <Link
                      to="/demo"
                      className="px-3 py-1.5 rounded-md bg-inverse text-surface font-semibold text-xs hover:opacity-90 transition-colors shadow-button"
                    >
                      Book a demo
                    </Link>
                  ) : (
                    <Link
                      to={`/demo?edition=${product.slug}`}
                      className="px-3 py-1.5 rounded-md bg-surface-raised border border-border text-ink font-medium text-xs hover:bg-canvas transition-colors"
                    >
                      Join waitlist
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Operator Banner */}
        <div className="mt-16 bg-surface-raised border border-border rounded-xl p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-border text-xs font-mono uppercase tracking-wider text-muted mb-3">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>Universal Intelligence</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-ink mb-2">
              Every edition includes the Plinth AI Operator.
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              {BRAND.aiClaim}
            </p>
          </div>
          <Link
            to="/platform"
            className="shrink-0 px-5 py-2.5 rounded-lg bg-surface border border-border text-ink text-sm font-semibold hover:border-border-strong transition-colors"
          >
            Learn about the platform
          </Link>
        </div>
      </div>
    </div>
  );
};
