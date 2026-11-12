"use client"
import React from "react"
import { UserAccess } from "../../../features/auth/UserAccess"

export default function AccessPage() {
  return (
    <div className="flex-1 w-full min-h-screen overflow-y-auto p-4 sm:p-6 lg:p-8 bg-muted/60">
      <div className="w-full space-y-6">
        <UserAccess />
      </div>
    </div>
  )
}

