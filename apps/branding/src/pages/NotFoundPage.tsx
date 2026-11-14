import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertCircle, Home, Layers } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="bg-canvas min-h-[75vh] flex items-center justify-center py-20 px-4">
      <Helmet>
        <title>404 — Page Not Found — Plinth</title>
        <meta name="description" content="The page you requested does not exist." />
      </Helmet>

      <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 text-center shadow-card">
        <div className="w-14 h-14 rounded-xl bg-surface-raised border border-border flex items-center justify-center mx-auto mb-5 text-ink">
          <AlertCircle className="w-7 h-7 text-muted" />
        </div>
        <span className="text-xs font-mono uppercase tracking-wider text-muted block mb-1">Error 404</span>
        <h1 className="text-2xl font-bold text-ink mb-3 font-sans">Record Not Located</h1>
        <p className="text-sm text-muted mb-8 leading-relaxed">
          The requested operational resource or URL path does not exist in this environment.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-inverse text-surface font-semibold text-sm hover:opacity-90 transition-colors shadow-button"
          >
            <Home className="w-4 h-4" />
            Return Home
          </Link>
          <Link
            to="/products"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-surface border border-border text-ink font-semibold text-sm hover:border-border-strong transition-colors"
          >
            <Layers className="w-4 h-4" />
            View Products
          </Link>
        </div>
      </div>
    </div>
  );
};
