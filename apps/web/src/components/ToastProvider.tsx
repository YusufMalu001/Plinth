'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  X,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { subscribeToasts, Toast } from './toast-store';

const toastConfig = {
  success: {
    icon: CheckCircle2,
    tag: 'Completed',
    iconColor: 'text-emerald-500 dark:text-emerald-400',
    iconBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    progressBar: 'bg-gradient-to-r from-emerald-500 to-[#004a80]',
    accentBorder: 'border-t-2 border-t-emerald-500',
  },
  error: {
    icon: XCircle,
    tag: 'Action Required',
    iconColor: 'text-rose-500 dark:text-rose-400',
    iconBg: 'bg-rose-500/10 dark:bg-rose-400/10',
    badgeBg: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
    progressBar: 'bg-gradient-to-r from-rose-500 to-rose-700',
    accentBorder: 'border-t-2 border-t-rose-500',
  },
  warning: {
    icon: AlertTriangle,
    tag: 'Attention',
    iconColor: 'text-[#004a80] dark:text-blue-400',
    iconBg: 'bg-[#004a80]/10 dark:bg-blue-400/10',
    badgeBg: 'bg-[#004a80]/10 text-[#004a80] dark:text-blue-300 border-[#004a80]/20',
    progressBar: 'bg-gradient-to-r from-[#004a80] to-blue-400',
    accentBorder: 'border-t-2 border-t-[#004a80]',
  },
  info: {
    icon: Info,
    tag: 'Update',
    iconColor: 'text-[#004a80] dark:text-blue-400',
    iconBg: 'bg-[#004a80]/10 dark:bg-blue-400/10',
    badgeBg: 'bg-[#004a80]/10 text-[#004a80] dark:text-blue-300 border-[#004a80]/20',
    progressBar: 'bg-gradient-to-r from-[#004a80] to-blue-400',
    accentBorder: 'border-t-2 border-t-[#004a80]',
  },
  hermes: {
    icon: Sparkles,
    tag: 'Hermes AI',
    iconColor: 'text-amber-500 dark:text-amber-400',
    iconBg: 'bg-gradient-to-br from-amber-500/20 to-[#004a80]/20 dark:from-amber-400/25 dark:to-blue-500/25 border border-amber-500/30',
    badgeBg: 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/30 font-semibold',
    progressBar: 'bg-gradient-to-r from-amber-500 via-[#004a80] to-amber-500',
    accentBorder: 'border-t-2 border-t-amber-500',
  },
  ai: {
    icon: Sparkles,
    tag: 'Hermes AI',
    iconColor: 'text-amber-500 dark:text-amber-400',
    iconBg: 'bg-gradient-to-br from-amber-500/20 to-[#004a80]/20 dark:from-amber-400/25 dark:to-blue-500/25 border border-amber-500/30',
    badgeBg: 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/30 font-semibold',
    progressBar: 'bg-gradient-to-r from-amber-500 via-[#004a80] to-amber-500',
    accentBorder: 'border-t-2 border-t-amber-500',
  },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return subscribeToasts((toast) => {
      setToasts((current) => [...current, toast]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.duration);
    });
  }, []);

  const dismiss = (id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  };

  return (
    <>
      {children}
      {/* Toast Container - Pinned to top-right below navbar */}
      <div
        className="fixed top-20 right-6 z-[100000] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const config = toastConfig[toast.kind] ?? toastConfig.info;
          const Icon = config.icon;

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto relative overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-800 ${config.accentBorder} bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-900 dark:text-slate-100 shadow-2xl shadow-slate-900/20 transition-all animate-in slide-in-from-top-4 fade-in-0 duration-300`}
              role="alert"
            >
              <div className="p-4 pr-3.5">
                <div className="flex items-start gap-3">
                  {/* Status Icon */}
                  <div className="mt-0.5 shrink-0">
                    <div className={`flex h-8.5 w-8.5 items-center justify-center rounded-xl ${config.iconBg} shadow-2xs`}>
                      <Icon className={`h-4.5 w-4.5 ${config.iconColor}`} size={18} />
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${config.badgeBg}`}>
                        {toast.badge || config.tag}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {toast.title}
                    </h4>

                    {toast.message && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                        {toast.message}
                      </p>
                    )}

                    {/* Action Buttons */}
                    {(toast.action || toast.secondaryAction) && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {toast.action && (
                          toast.action.href ? (
                            <Link
                              href={toast.action.href}
                              onClick={() => dismiss(toast.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[#004a80] hover:bg-[#003c68] active:scale-95 px-3 py-1.5 text-xs font-bold text-white transition-all shadow-xs"
                            >
                              <span>{toast.action.label}</span>
                              <ArrowRight size={12} />
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                toast.action?.onClick?.();
                                dismiss(toast.id);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-[#004a80] hover:bg-[#003c68] active:scale-95 px-3 py-1.5 text-xs font-bold text-white transition-all shadow-xs"
                            >
                              <span>{toast.action.label}</span>
                              <ArrowRight size={12} />
                            </button>
                          )
                        )}

                        {toast.secondaryAction && (
                          <button
                            type="button"
                            onClick={() => {
                              toast.secondaryAction?.onClick?.();
                              dismiss(toast.id);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                          >
                            <span>{toast.secondaryAction.label}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Dismiss Button */}
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => dismiss(toast.id)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Progress Bar Line */}
              <div className="h-0.5 w-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full ${config.progressBar}`}
                  style={{
                    animation: `toast-progress ${toast.duration}ms linear forwards`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        @keyframes toast-progress {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </>
  );
}
