'use client';

import React from "react"
import { RibbonFieldGradient } from "@/components/ui/RibbonFieldGradient"
import Image from "next/image"

export interface AuthShellProps {
  children: React.ReactNode
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="h-screen w-full flex bg-white dark:bg-[#070b14] select-none overflow-hidden">
      {/* ========================================================================= */}
      {/* LEFT COLUMN: Animated Dynamic Silk Gradient with Original Logo & White Text */}
      {/* ========================================================================= */}
      <div className="hidden lg:flex relative lg:w-1/2 xl:w-[48%] h-screen overflow-hidden flex-col justify-between p-8 sm:p-10 lg:p-12 xl:p-14">
        {/* Full-bleed Dynamic Animated Canvas Gradient */}
        <RibbonFieldGradient
          angle={36}
          wave={30}
          softness={36}
          scale={70}
          speed={90}
          animated={true}
          grainOpacity={0.20}
          paletteTheme="synergy-gold"
        />

        {/* Top Original Branding in Left Column */}
        <div className="relative z-10 flex items-center justify-between">
          <Image
            src="/synergy.png"
            alt="Synergy International"
            width={160}
            height={48}
            className="h-8 w-auto object-contain"
            priority
          />
        </div>

        {/* Spacer to push content to the bottom */}
        <div className="flex-1" />

        {/* Bottom Hero Narrative across the left panel in pure crisp white Orbitron font */}
        <div className="relative z-10 w-full pb-2">
          <h1 className="font-orbitron text-3xl sm:text-4xl lg:text-[40px] xl:text-[46px] font-black tracking-tight text-white uppercase leading-[1.12] drop-shadow-sm">
            PRECISION OPERATIONS.<br />
            INTELLIGENT TELEMETRY.
          </h1>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT COLUMN: Pure Clean White Authentication Area (Zero scroll, direct)   */}
      {/* ========================================================================= */}
      <div className="w-full lg:w-1/2 xl:w-[52%] h-screen bg-white dark:bg-[#070b14] flex flex-col justify-between p-6 sm:p-10 lg:p-12 overflow-y-auto lg:overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-end text-xs text-slate-500 dark:text-slate-400">
          <span>Need help? <a href="#support" className="text-[#004a80] dark:text-blue-400 font-semibold hover:underline">Contact Support</a></span>
        </div>

        {/* Centered Direct Input Form Area */}
        <div className="w-full max-w-[400px] mx-auto my-auto py-2">
          {children}
        </div>

        {/* Bottom Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span>Protected by Synergy Shield • 256-bit TLS</span>
          <div className="flex items-center gap-3">
            <a href="#privacy" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Privacy</a>
            <span>•</span>
            <a href="#terms" className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </div>
  )
}
