import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { 
  ArrowRight, 
  ChevronRight, 
  Sparkles, 
  AlertCircle, 
  HelpCircle,
  FileCheck,
  Check
} from 'lucide-react';
import { PRODUCTS, getProductBySlug, BRAND, PRICING_FROM } from '../content/products';
import { StatusPill } from '../components/StatusPill';
import { DynamicIcon } from '../components/DynamicIcon';
import { FaqAccordion } from '../components/FaqAccordion';

export const ProductDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const product = slug ? getProductBySlug(slug) : undefined;
  const [selectedModuleIndex, setSelectedModuleIndex] = useState(0);

  // Unknown slug fallback
  if (!product) {
    return (
      <div className="bg-page min-h-[70vh] flex items-center justify-center py-20 px-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-xl p-8 text-center shadow-popover">
          <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4 text-ink-secondary">
            <AlertCircle className="w-6 h-6 text-ink-placeholder" />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">Product Not Found</h1>
          <p className="text-sm text-ink-secondary mb-6 leading-relaxed">
            The edition &quot;{slug}&quot; does not exist or may have been updated.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/products"
              className="px-4 py-2 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button"
            >
              Browse all products
            </Link>
            <Link
              to="/"
              className="px-4 py-2 rounded-lg bg-surface border border-border text-ink font-semibold text-sm hover:border-border-strong transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isAvailable = product.status === 'available';
  const activeModule = product.modules[selectedModuleIndex] || product.modules[0];
  const otherProducts = PRODUCTS.filter((p) => p.slug !== product.slug);

  // Schema.org JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: product.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Cloud',
    description: product.summary,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: product.slug === 'manufacturing' ? PRICING_FROM.amount.toString() : 'Contact for pricing',
    },
  };

  return (
    <div className="bg-page min-h-screen py-12">
      <Helmet>
        <title>{product.name} — {BRAND.name}</title>
        <meta name="description" content={`${product.name}: ${product.tagline} ${product.summary}`} />
        <link rel="canonical" href={`https://plinth.erp/products/${product.slug}`} />
        <meta property="og:title" content={`${product.name} — ${BRAND.name}`} />
        <meta property="og:description" content={product.tagline} />
        <meta property="og:type" content="product" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center space-x-2 text-sm text-ink-placeholder">
          <Link to="/" className="hover:text-ink transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4 text-ink-secondary" />
          <Link to="/products" className="hover:text-ink transition-colors">Products</Link>
          <ChevronRight className="w-4 h-4 text-ink-secondary" />
          <span className="text-ink font-medium" aria-current="page">{product.shortName}</span>
        </nav>

        {/* 1. Hero */}
        <div className="bg-surface rounded-2xl border border-border p-8 sm:p-12 mb-16 shadow-popover">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center text-ink">
                <DynamicIcon name={product.modules[0]?.iconName || 'Layers'} className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-ink font-sans">
                  {product.name}
                </h1>
                <p className="text-xs text-ink-muted uppercase tracking-wider mt-0.5">
                  Designed for {product.audience}
                </p>
              </div>
            </div>
            <StatusPill status={product.status} />
          </div>

          <p className="text-xl sm:text-2xl font-medium text-ink max-w-3xl mb-4 leading-snug">
            {product.tagline}
          </p>

          <p className="text-base text-ink-secondary max-w-3xl mb-8 leading-relaxed">
            {product.summary}
          </p>

          {/* Pricing claim if Manufacturing */}
          {product.slug === 'manufacturing' && (
            <div className="mb-8 p-4 bg-muted border border-border rounded-lg inline-block">
              <span className="text-xs uppercase tracking-wider text-ink-muted block mb-1">Predictable Billing</span>
              <span className="text-lg font-bold text-ink">From ₹{PRICING_FROM.amount.toLocaleString('en-IN')} per plant per month.</span>
              <span className="text-xs text-ink-secondary block mt-0.5">Flat monthly subscription per plant. Not per user.</span>
            </div>
          )}

          {/* Provenance note requirement */}
          {product.slug === 'provenance' && (
            <div className="mb-8 p-4 bg-muted border border-border rounded-lg text-xs text-ink-muted">
              Built for batch traceability. Regulated pharma support comes later.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            {isAvailable ? (
              <Link
                to="/demo"
                className="px-6 py-3 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button flex items-center gap-2"
              >
                Book a demo
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                to={`/demo?edition=${product.slug}`}
                className="px-6 py-3 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button flex items-center gap-2"
              >
                Join the waitlist
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
            <Link
              to="/platform"
              className="px-6 py-3 rounded-lg bg-surface border border-border text-ink font-semibold text-sm hover:border-border-strong transition-colors"
            >
              Explore shared platform
            </Link>
          </div>
        </div>

        {/* 2. Who it is for & Pain Points */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          <div className="bg-surface rounded-xl border border-border p-6 shadow-popover">
            <span className="text-xs uppercase tracking-wider text-ink-muted block mb-2">Audience</span>
            <h2 className="text-lg font-bold text-ink mb-3">Who it is for</h2>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Specialized for teams operating across {product.audience}. Configured out of the box to eliminate disparate sheets and disjointed point solutions.
            </p>
          </div>

          <div className="lg:col-span-2 bg-surface rounded-xl border border-border p-6 shadow-popover">
            <span className="text-xs uppercase tracking-wider text-ink-muted block mb-2">Operational Bottlenecks</span>
            <h2 className="text-lg font-bold text-ink mb-4">Core problems eliminated</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {product.painPoints.map((point, idx) => (
                <div key={idx} className="bg-muted p-4 rounded-lg border border-border flex flex-col justify-start">
                  <div className="w-6 h-6 rounded bg-surface border border-border text-ink text-xs flex items-center justify-center font-bold mb-2">
                    0{idx + 1}
                  </div>
                  <p className="text-xs text-ink font-medium leading-relaxed">
                    {point}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Interactive Module Explorer */}
        <div className="bg-surface rounded-2xl border border-border p-8 mb-16 shadow-popover">
          <div className="max-w-2xl mb-8">
            <span className="text-xs uppercase tracking-wider text-ink-muted block mb-1">Architecture</span>
            <h2 className="text-2xl font-bold text-ink mb-2">Included Modules & Capabilities</h2>
            <p className="text-sm text-ink-secondary">
              Select any operational module to view how Plinth handles its data lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Module List tabs */}
            <div className="lg:col-span-5 space-y-2">
              {product.modules.map((mod, index) => {
                const isActive = index === selectedModuleIndex;
                return (
                  <button
                    key={mod.name}
                    type="button"
                    onClick={() => setSelectedModuleIndex(index)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3 ${
                      isActive
                        ? 'bg-muted border-border-strong shadow-popover'
                        : 'bg-surface border-border hover:border-border-strong'
                    }`}
                  >
                    <div className={`p-2 rounded-lg border ${
                      isActive ? 'bg-surface border-border text-ink' : 'bg-muted border-border text-ink-secondary'
                    }`}>
                      <DynamicIcon name={mod.iconName} className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-ink">{mod.name}</span>
                        {isActive && <ChevronRight className="w-4 h-4 text-accent" />}
                      </div>
                      <p className="text-xs text-ink-secondary mt-0.5 leading-snug">{mod.benefit}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mock Screen Detail */}
            <div className="lg:col-span-7 bg-muted border border-border rounded-xl p-6 shadow-inner">
              <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-border-strong" />
                  <div className="w-3 h-3 rounded-full bg-border-strong" />
                  <div className="w-3 h-3 rounded-full bg-border-strong" />
                  <span className="ml-2 text-xs text-ink-muted">
                    Plinth OS / {product.shortName} / {activeModule.name}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-surface border border-border text-ink-muted">
                  <Check className="w-3 h-3 text-accent" /> Ledger Verified
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-ink">{activeModule.name} Execution</h3>
                    <p className="text-xs text-ink-secondary">{activeModule.benefit}</p>
                  </div>
                  <span className="text-xs text-ink bg-surface px-2.5 py-1 rounded border border-border">
                    Audit Log #PL-{product.shortName.toUpperCase().slice(0, 3)}-994
                  </span>
                </div>

                {/* Mock data table */}
                <div className="border border-border rounded-lg bg-surface overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-muted border-b border-border text-ink-secondary uppercase">
                      <tr>
                        <th className="py-2 px-3">Item / Record</th>
                        <th className="py-2 px-3">Quantity / Batch</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="py-2.5 px-3 font-medium text-ink">SKU-7721-MTR</td>
                        <td className="py-2.5 px-3 text-ink-muted">1,250 units</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] bg-green-bg text-green-text">
                            Verified
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-ink-placeholder text-[11px]">View detail</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 font-medium text-ink">SKU-9902-ALU</td>
                        <td className="py-2.5 px-3 text-ink-muted">420 units</td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] bg-amber-bg text-amber-text">
                            Inspection
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-ink-placeholder text-[11px]">View detail</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="p-3 bg-surface border border-border rounded-lg flex items-center justify-between text-xs">
                  <span className="text-ink-secondary">Verification rule check:</span>
                  <span className="text-accent font-semibold">100% parameter compliance</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Horizontal Workflow Stepper */}
        <div className="bg-surface rounded-2xl border border-border p-8 mb-16 shadow-popover">
          <div className="max-w-2xl mb-8">
            <span className="text-xs uppercase tracking-wider text-ink-muted block mb-1">Operational Flow</span>
            <h2 className="text-2xl font-bold text-ink mb-2">Standard 4-Step Operational Lifecycle</h2>
            <p className="text-sm text-ink-secondary">
              Structured transitions from procurement and scheduling to dispatch and reconciliation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
            {product.workflowSteps.map((step, idx) => (
              <div key={idx} className="bg-muted border border-border rounded-xl p-5 relative">
                <div className="flex items-center justify-between mb-3">
                  <span className="w-7 h-7 rounded-full bg-surface border border-border text-xs font-bold text-ink flex items-center justify-center">
                    0{step.step}
                  </span>
                  {idx < product.workflowSteps.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-ink-placeholder hidden md:block" />
                  )}
                </div>
                <h3 className="text-sm font-bold text-ink mb-1">{step.title}</h3>
                <p className="text-xs text-ink-secondary leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 5. "Ask it in plain language" - AI Operator Examples */}
        <div className="bg-surface rounded-2xl border border-border p-8 mb-16 shadow-popover">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-accent" />
            <span className="text-xs uppercase tracking-wider text-ink-muted">Plinth AI Operator</span>
          </div>
          <h2 className="text-2xl font-bold text-ink mb-3">Ask it in plain language.</h2>
          <p className="text-sm text-ink-secondary max-w-2xl mb-8 leading-relaxed">
            {BRAND.aiClaim}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {product.aiExamples.map((item, idx) => (
              <div key={idx} className="bg-muted rounded-xl border border-border p-5 flex flex-col justify-between">
                <div className="mb-4">
                  <span className="text-[10px] uppercase tracking-wider text-ink-muted block mb-1.5">User Request</span>
                  <div className="bg-surface p-3 rounded-lg border border-border text-xs text-ink">
                    &ldquo;{item.prompt}&rdquo;
                  </div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-ink-muted block mb-1.5">System Preview</span>
                  <div className="bg-surface p-3 rounded-lg border border-border text-xs text-ink leading-relaxed">
                    <span className="inline-block w-2 h-2 rounded-full bg-accent mr-1.5" />
                    {item.result}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Specifications & Integrations */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {/* Specs Table */}
          <div className="lg:col-span-2 bg-surface rounded-xl border border-border p-6 shadow-popover">
            <h2 className="text-lg font-bold text-ink mb-4">Technical & Operational Specifications</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-border">
                  {product.specs.map((spec, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-surface' : 'bg-muted'}>
                      <td className="py-2.5 px-4 text-ink-muted w-1/3">{spec.label}</td>
                      <td className="py-2.5 px-4 font-medium text-ink">{spec.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Integrations */}
          <div className="bg-surface rounded-xl border border-border p-6 shadow-popover">
            <h2 className="text-lg font-bold text-ink mb-4">Ecosystem Integrations</h2>
            <p className="text-xs text-ink-secondary mb-4 leading-relaxed">
              Native and API-driven sync capabilities built for this edition.
            </p>
            <ul className="space-y-2">
              {product.integrations.map((intg) => (
                <li key={intg} className="flex items-center gap-2 p-2 rounded-lg bg-muted border border-border text-xs text-ink">
                  <FileCheck className="w-4 h-4 text-accent shrink-0" />
                  <span>{intg}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 7. Product FAQs */}
        <div className="bg-surface rounded-2xl border border-border p-8 mb-16 shadow-popover">
          <div className="max-w-2xl mb-8">
            <div className="flex items-center gap-2 mb-1">
              <HelpCircle className="w-4 h-4 text-ink-secondary" />
              <span className="text-xs uppercase tracking-wider text-ink-muted">Frequently Asked</span>
            </div>
            <h2 className="text-2xl font-bold text-ink">Frequently asked questions about {product.name}</h2>
          </div>
          <FaqAccordion items={product.faqs} />
        </div>

        {/* 8. Other Editions Explorer */}
        <div className="mb-16">
          <h2 className="text-xl font-bold text-ink mb-6">Explore Other Plinth Editions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {otherProducts.slice(0, 3).map((other) => (
              <div key={other.slug} className="bg-surface border border-border rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-sm text-ink">{other.name}</span>
                    <StatusPill status={other.status} />
                  </div>
                  <p className="text-xs text-ink-secondary mb-4">{other.tagline}</p>
                </div>
                <Link
                  to={`/products/${other.slug}`}
                  className="text-xs font-semibold text-ink hover:text-accent flex items-center gap-1"
                >
                  View edition <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA Strip */}
        <div className="bg-muted border border-border rounded-xl p-8 text-center max-w-3xl mx-auto shadow-popover">
          <h2 className="text-2xl font-bold text-ink mb-2">Ready to standardize your operations?</h2>
          <p className="text-sm text-ink-secondary mb-6">
            Schedule an operational walk-through tailored to your plant or facility requirements.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {isAvailable ? (
              <Link
                to="/demo"
                className="px-6 py-3 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button"
              >
                Book a demo
              </Link>
            ) : (
              <Link
                to={`/demo?edition=${product.slug}`}
                className="px-6 py-3 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button"
              >
                Join the waitlist
              </Link>
            )}
            <Link
              to="/products"
              className="px-6 py-3 rounded-lg bg-surface border border-border text-ink font-semibold text-sm hover:border-border-strong transition-colors"
            >
              All editions
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
