'use client';

import React from "react"
import { Logo } from "../../../config/brand"
import BackgroundPaths from "../../../components/kokonutui/background-paths"

export interface AuthShellProps {
  children: React.ReactNode
}

/**
 * Login shell — Plinth Dark Edition. The kokonutui "Background Paths"
 * flowing-line animation fills the whole screen on a dark #09090b base,
 * with the authentication form suspended as a clean glass panel.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="relative h-screen w-full select-none overflow-hidden bg-[#09090b] text-[#f4f4f5]">
      {/* Full-screen animated glowing background paths */}
      <div className="absolute inset-0" aria-hidden="true">
        <BackgroundPaths className="h-full min-h-0 w-full" count={42} angle={-8}>
          {null}
        </BackgroundPaths>
      </div>

      {/* Overlay: brand top-left, help top-right, card centre, hero + footer bottom */}
      <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-10 lg:p-12">
        <div className="flex items-center justify-between">
          <Logo tone="paper" className="text-3xl" />
          <span className="text-xs text-[#a1a1aa]">
            Need help?{' '}
            <a href="#support" className="font-semibold text-white hover:underline">Contact Support</a>
          </span>
        </div>

        {/* Centred authentication card over the lines */}
        <div className="w-full max-w-[420px] mx-auto my-auto py-6">
          <div className="rounded-2xl border border-white/10 bg-[#18181b]/75 p-6 sm:p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
            {children}
          </div>
        </div>

        <div className="space-y-4">
          <div className="max-w-xl">
            <h1 className="text-2xl sm:text-3xl lg:text-[40px] font-semibold tracking-[-0.01em] text-white uppercase leading-[1.1]">
              STRUCTURED OPERATIONS.<br />
              ACCOUNTABLE OUTPUT.
            </h1>
            <p className="mt-2 text-sm text-[#a1a1aa]">
              Industrial cloud ERP for manufacturing plants.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-[#71717a]">
            <span>Protected by 256-bit TLS</span>
            <div className="flex items-center gap-3">
              <a href="#privacy" className="hover:text-white transition-colors">Privacy</a>
              <span>•</span>
              <a href="#terms" className="hover:text-white transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
