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
 iconColor: 'text-tone-green-text ',
 iconBg: 'bg-tone-emerald-bg/10 ',
 badgeBg: 'bg-tone-emerald-bg/10 text-tone-green-text border-tone-green-solid/20',
 progressBar: 'bg-tone-green-solid',
 accentBorder: 'border-t-2 border-t-emerald-500',
 },
 error: {
 icon: XCircle,
 tag: 'Action Required',
 iconColor: 'text-tone-red-text ',
 iconBg: 'bg-tone-rose-bg/10 ',
 badgeBg: 'bg-tone-rose-bg/10 text-tone-red-text border-tone-red-solid/20',
 progressBar: 'bg-tone-red-solid',
 accentBorder: 'border-t-2 border-t-rose-500',
 },
 warning: {
 icon: AlertTriangle,
 tag: 'Attention',
 iconColor: 'text-tone-blue-solid ',
 iconBg: 'bg-tone-blue-bg ',
 badgeBg: 'bg-tone-blue-bg text-tone-blue-solid border-tone-blue-solid/25',
 progressBar: 'bg-tone-blue-solid',
 accentBorder: '',
 },
 info: {
 icon: Info,
 tag: 'Update',
 iconColor: 'text-tone-blue-solid ',
 iconBg: 'bg-tone-blue-bg ',
 badgeBg: 'bg-tone-blue-bg text-tone-blue-solid border-tone-blue-solid/25',
 progressBar: 'bg-tone-blue-solid',
 accentBorder: '',
 },
 hermes: {
 icon: Sparkles,
 tag: 'Hermes AI',
 iconColor: 'text-tone-amber-text ',
 iconBg: 'bg-tone-amber-bg border border-tone-amber-solid/25',
 badgeBg: 'bg-tone-amber-bg/15 text-tone-amber-text border-tone-amber-solid/30 font-semibold',
 progressBar: 'bg-tone-amber-solid',
 accentBorder: 'border-t-2 border-t-amber-500',
 },
 ai: {
 icon: Sparkles,
 tag: 'Hermes AI',
 iconColor: 'text-tone-amber-text ',
 iconBg: 'bg-tone-amber-bg border border-tone-amber-solid/25',
 badgeBg: 'bg-tone-amber-bg/15 text-tone-amber-text border-tone-amber-solid/30 font-semibold',
 progressBar: 'bg-tone-amber-solid',
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
 className={`pointer-events-auto relative overflow-hidden rounded-2xl border border-border/90 ${config.accentBorder} bg-white/95 backdrop-blur-md text-ink shadow-2xl shadow-slate-900/20 transition-all animate-in slide-in-from-top-4 fade-in-0 duration-300`}
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

 <h4 className="text-sm font-bold text-ink leading-snug">
 {toast.title}
 </h4>

 {toast.message && (
 <p className="mt-1 text-xs text-ink-secondary leading-relaxed font-normal">
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
 className="inline-flex items-center gap-1.5 rounded-xl bg-inverse hover:bg-[#2E2E2E] active:bg-[#000000] px-3 py-1.5 text-xs font-semibold text-inverse transition-colors shadow-none"
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
 className="inline-flex items-center gap-1.5 rounded-xl bg-inverse hover:bg-[#2E2E2E] active:bg-[#000000] px-3 py-1.5 text-xs font-semibold text-inverse transition-colors shadow-none"
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
 className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-transparent hover:bg-muted px-3 py-1.5 text-xs font-semibold text-ink-secondary transition-colors"
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
 className="shrink-0 rounded-lg p-1.5 text-ink-muted hover:bg-muted hover:text-ink-secondary transition-colors"
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
