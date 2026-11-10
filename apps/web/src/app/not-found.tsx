"use client"

import React from "react"
import { NotFoundView } from "../components/ErrorState"

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 dark:bg-[#070b14] p-4 sm:p-8">
      <NotFoundView
        title="Page Not Found (404)"
        description="The Synergy ERP page or record you requested does not exist or has been moved."
      />
    </div>
  )
}
