'use client';

import React from "react"
import { Logo } from "../../../config/brand"
import BackgroundPaths from "../../../components/brand/BackgroundPaths"

export interface AuthShellProps {
  children: React.ReactNode
}

/**
 * Login shell — Plinth dark edition. The kokonutui "Background Paths"
 * flowing-line animation fills the whole screen on a near-black base and the
 * authentication card floats over it as a glass panel. The root `dark` class
 * activates the dark: variants already present on the form controls.
 */
export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="dark relative h-screen w-full select-none overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Full-screen animated background */}
      <div className="absolute inset-0" aria-hidden="true">
        <BackgroundPaths className="h-full min-h-0 w-full" count={42} angle={-8}>
          {null}
        </BackgroundPaths>
      </div>

      {/* Overlay: brand top-left, help top-right, card centre, hero + footer bottom */}
      <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-10 lg:p-12">
        <div className="flex items-center justify-between">
          <Logo tone="paper" className="text-2xl" />
          <span className="text-xs text-zinc-400">
            Need help?{' '}
            <a href="#support" className="font-semibold text-zinc-100 hover:underline">Contact Support</a>
          </span>
        </div>

        {/* Centred authentication card over the lines */}
        <div className="w-full max-w-[420px] mx-auto my-auto py-6">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 sm:p-8 shadow-2xl shadow-black/50 backdrop-blur-md">
            {children}
          </div>
        </div>

        <div className="space-y-4">
          <div className="max-w-xl">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white uppercase leading-[1.12]">
              Precision operations.<br />
              Intelligent telemetry.
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Enterprise resource planning for manufacturing and commerce.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-zinc-500">
            <span>Protected by 256-bit TLS</span>
            <div className="flex items-center gap-3">
              <a href="#privacy" className="hover:text-zinc-100 transition-colors">Privacy</a>
              <span>•</span>
              <a href="#terms" className="hover:text-zinc-100 transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
