import React from 'react';
import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { BRAND_COPY } from '../content/products';

export const Footer: React.FC = () => {
  const contactEmail = import.meta.env.VITE_CONTACT_EMAIL || 'contact@plintherp.com';
  const whatsappNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '+919822012345';
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}`;

  return (
    <footer className="w-full bg-surface border-t border-border mt-auto">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand Col */}
          <div className="md:col-span-2 space-y-4">
            <Logo />
            <p className="text-sm text-ink-muted uppercase tracking-wider font-semibold">
              {BRAND_COPY.masterHeadline}
            </p>
            <p className="text-sm text-ink-secondary max-w-md">
              {BRAND_COPY.masterSubline} Flat monthly subscriptions per plant with an audited, role-restricted AI operator.
            </p>
            <div className="pt-2 text-xs text-ink-muted">
              Built for industrial precision. Light theme only.
            </div>
          </div>

          {/* Navigation Links */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
              Navigation
            </span>
            <ul className="space-y-2 text-sm text-ink-secondary">
              <li>
                <Link to="/products" className="hover:text-ink transition-colors">
                  Products
                </Link>
              </li>
              <li>
                <Link to="/platform" className="hover:text-ink transition-colors">
                  Platform
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-ink transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-ink transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link to="/demo" className="hover:text-ink transition-colors">
                  Book a demo
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal and Contact */}
          <div className="space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted block">
              Contact & Legal
            </span>
            <ul className="space-y-2 text-sm text-ink-secondary">
              <li>
                <a href={`mailto:${contactEmail}`} className="hover:text-ink transition-colors">
                  {contactEmail}
                </a>
              </li>
              <li>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ink transition-colors"
                >
                  WhatsApp: {whatsappNumber}
                </a>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-ink transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-ink transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-muted">
          <div>&copy; 2026 Plinth. All rights reserved. Industrial cloud ERP.</div>
          <div className="">
            Structured Operations. Accountable Output.
          </div>
        </div>
      </div>
    </footer>
  );
};
