'use client';

import React from "react"
import { Logo } from "../../../config/brand"
import { SatinRidges } from "../../../components/brand/SatinRidges"

export interface AuthShellProps {
  children: React.ReactNode
}

/**
 * Login shell — Plinth design language. The left panel carries the
 * "Satin Ridges" flowing-satin background (soft grey folds, light-only);
 * the right column stays clean white for the authentication form.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="h-screen w-full flex bg-page select-none overflow-hidden">
      {/* Left column: satin ridges background with the brand lockup */}
      <div className="hidden lg:flex relative lg:w-1/2 xl:w-[48%] h-screen overflow-hidden flex-col justify-between p-8 sm:p-10 lg:p-12 xl:p-14">
        <div className="absolute inset-0" aria-hidden="true">
          <SatinRidges />
        </div>

        <div className="relative z-10 flex items-center justify-between">
          <Logo className="text-2xl" />
        </div>

        <div className="flex-1" />

        <div className="relative z-10 w-full pb-2">
          <h1 className="text-3xl sm:text-4xl lg:text-[40px] xl:text-[46px] font-black tracking-tight text-ink uppercase leading-[1.12]">
            PRECISION OPERATIONS.<br />
            INTELLIGENT TELEMETRY.
          </h1>
          <p className="mt-3 text-sm text-ink-secondary">
            Enterprise resource planning for manufacturing and commerce.
          </p>
        </div>
      </div>

      {/* Right column: clean white authentication area */}
      <div className="w-full lg:w-1/2 xl:w-[52%] h-screen bg-page flex flex-col justify-between p-6 sm:p-10 lg:p-12 overflow-y-auto lg:overflow-hidden">
        <div className="flex items-center justify-end text-xs text-ink-muted">
          <span>Need help? <a href="#support" className="text-ink font-semibold hover:underline">Contact Support</a></span>
        </div>

        {/* Centered Direct Input Form Area */}
        <div className="w-full max-w-[400px] mx-auto my-auto py-2">
          {children}
        </div>

        {/* Bottom Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted pt-3 border-t border-border">
          <span>Protected by 256-bit TLS</span>
          <div className="flex items-center gap-3">
            <a href="#privacy" className="hover:text-ink transition-colors">Privacy</a>
            <span>•</span>
            <a href="#terms" className="hover:text-ink transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </div>
  );
}
