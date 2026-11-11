"use client"

import React, { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Compass,
  Home,
  Lock,
  RefreshCw,
  RotateCcw,
  ShieldX,
  WifiOff,
} from "lucide-react"
import { friendlyErrorMessage } from "../features/auth/access-control"

export interface ErrorStateProps {
  error?: Error | unknown
  title?: string
  description?: string
  retry?: () => void
  resourceName?: string
  actionName?: string
  type?: "auto" | "permission_denied" | "network_error" | "not_found" | "server_error"
}

/**
 * Universal, high-end styled state handler for Access Denied, 404 Not Found, Network Offline, and Server Errors.
 */
export function ErrorState({
  error,
  title,
  description,
  retry,
  resourceName,
  actionName,
  type = "auto",
}: ErrorStateProps) {
  const [retrying, setRetrying] = useState(false)

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : (error as { message?: string })?.message || ""

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: number }).status)
      : undefined

  // Determine error type if set to auto
  const isPermission =
    type === "permission_denied" ||
    status === 403 ||
    /permission denied|not authorized|forbidden|access denied|actor.*is not authorized/i.test(
      rawMessage
    )

  const isNetwork =
    type === "network_error" ||
    /failed to fetch|networkerror|network error|econnrefused|disconnected|offline/i.test(
      rawMessage
    )

  const isNotFound =
    type === "not_found" ||
    status === 404 ||
    /not found|does not exist|cannot find/i.test(rawMessage)

  const handleRetry = async () => {
    if (!retry) return
    setRetrying(true)
    try {
      await retry()
    } finally {
      setTimeout(() => setRetrying(false), 500)
    }
  }

  // 1. PERMISSION DENIED / ACCESS RESTRICTED VIEW
  if (isPermission) {
    return (
      <PermissionDeniedView
        title={title}
        description={description || friendlyErrorMessage(error)}
        resourceName={resourceName}
        actionName={actionName}
      />
    )
  }

  // 2. NETWORK CONNECTION LOST VIEW
  if (isNetwork) {
    return (
      <NetworkErrorView
        title={title}
        description={description || "Connection to Plinth Cloud Services could not be established."}
        retrying={retrying}
        onRetry={handleRetry}
      />
    )
  }

  // 3. RESOURCE NOT FOUND VIEW
  if (isNotFound) {
    return (
      <NotFoundView
        title={title}
        description={description || "The requested workspace record or page could not be located."}
      />
    )
  }

  // 4. GENERIC SERVER / SYSTEM ERROR VIEW
  return (
    <GenericErrorView
      title={title}
      description={description || friendlyErrorMessage(error)}
      retrying={retrying}
      onRetry={handleRetry}
    />
  )
}

/**
 * Creative, modern Permission Denied State
 */
export function PermissionDeniedView({
  title = "Access Restricted: Capability Required",
  description,
  resourceName,
  actionName,
}: {
  title?: string
  description?: string
  resourceName?: string
  actionName?: string
}) {
  const router = useRouter()

  return (
    <div className="flex min-h-[520px] w-full flex-1 items-center justify-center p-4 sm:p-8 font-manrope animate-in fade-in duration-300">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-8 sm:p-10 text-center shadow-xl">
        {/* Glow accent */}
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#004a80]/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-[#004a80]/10 blur-3xl pointer-events-none" />

        {/* Security Shield Icon Badge */}
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#004a80]/15 text-[#004a80] dark:text-blue-300 border border-[#004a80]/30 shadow-md shadow-[#004a80]/10">
          <ShieldX size={38} strokeWidth={2.2} />
          <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-white text-[10px] font-black ring-2 ring-white dark:ring-slate-900">
            <Lock size={12} strokeWidth={3} />
          </span>
        </div>

        {/* Header and Explanation */}
        <span className="rounded-full bg-[#004a80]/15 border border-[#004a80]/30 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#004a80] dark:text-blue-300 font-manrope">
          Security Policy Enforced
        </span>

        <h2 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          {title}
        </h2>

        <p className="mt-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          {description ||
            "Your workspace account does not have authorization to view this module. Role capabilities are governed by your organizational RBAC policy."}
        </p>

        {/* Resource Badge if available */}
        {(resourceName || actionName) && (
          <div className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800/80 px-4 py-2 border border-slate-200 dark:border-slate-700/80 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Required Grant:</span>
            <span className="font-mono text-[#004a80] dark:text-blue-300 font-black">
              {actionName || "read"}:{resourceName || "Module"}
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-2xs cursor-pointer"
          >
            <ArrowLeft size={15} strokeWidth={2.5} />
            <span>Go Back</span>
          </button>

          <Link
            href="/calendar"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-4 py-2.5 text-xs font-extrabold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            <Calendar size={15} strokeWidth={2.2} />
            <span>Operations Calendar</span>
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[#004a80] hover:bg-[#003c68] text-white px-5 py-2.5 text-xs font-black shadow-md shadow-[#004a80]/20 transition"
          >
            <Home size={15} strokeWidth={2.5} />
            <span>Home</span>
          </Link>
        </div>

        {/* Footer Support Info */}
        <div className="mt-8 border-t border-slate-100 dark:border-slate-800/80 pt-4 text-[11px] font-semibold text-slate-400">
          Need access to this feature? Contact your system administrator to assign the appropriate role.
        </div>
      </div>
    </div>
  )
}

/**
 * Creative Network Connection Error State
 */
export function NetworkErrorView({
  title = "Connection Lost to Plinth Cloud",
  description = "Unable to communicate with the live operations server. Please check your internet connection or network status.",
  retrying,
  onRetry,
}: {
  title?: string
  description?: string
  retrying?: boolean
  onRetry?: () => void
}) {
  return (
    <div className="flex min-h-[500px] w-full flex-1 items-center justify-center p-4 sm:p-8 font-manrope animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-[#0c121e] p-8 sm:p-10 text-center shadow-xl">
        {/* Glow accent */}
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />

        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/15 text-rose-500 border border-rose-500/30 shadow-md shadow-rose-500/10">
          <WifiOff size={38} strokeWidth={2.2} />
        </div>

        <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-300 font-manrope">
          Network Disconnected
        </span>

        <h2 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          {title}
        </h2>

        <p className="mt-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          {description}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-xl bg-[#004a80] hover:bg-[#003c68] text-white px-6 py-2.5 text-xs font-black shadow-md shadow-[#004a80]/20 transition cursor-pointer"
            >
              <RefreshCw size={15} className={retrying ? "animate-spin" : ""} strokeWidth={2.5} />
              <span>{retrying ? "Reconnecting..." : "Reconnect Live Stream"}</span>
            </button>
          )}

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <Home size={15} strokeWidth={2.5} />
            <span>Go to Home</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * Creative 404 Not Found State
 */
export function NotFoundView({
  title = "Page or Resource Not Found",
  description = "The requested workflow, product record, or dashboard screen does not exist or has been moved.",
}: {
  title?: string
  description?: string
}) {
  const router = useRouter()

  return (
    <div className="flex min-h-[500px] w-full flex-1 items-center justify-center p-4 sm:p-8 font-manrope animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-8 sm:p-10 text-center shadow-xl">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#004a80]/10 blur-3xl pointer-events-none" />

        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 shadow-md shadow-blue-500/10">
          <Compass size={38} strokeWidth={2.2} />
        </div>

        <span className="rounded-full bg-blue-500/15 border border-blue-500/30 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 font-manrope">
          Error 404: Not Found
        </span>

        <h2 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          {title}
        </h2>

        <p className="mt-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          {description}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-2xs cursor-pointer"
          >
            <ArrowLeft size={15} strokeWidth={2.5} />
            <span>Go Back</span>
          </button>

          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-[#004a80] hover:bg-[#003c68] text-white px-5 py-2.5 text-xs font-black shadow-md shadow-[#004a80]/20 transition"
          >
            <Home size={15} strokeWidth={2.5} />
            <span>Dashboard Overview</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * Creative System / Server Error State
 */
export function GenericErrorView({
  title = "Something Went Wrong",
  description,
  retrying,
  onRetry,
}: {
  title?: string
  description?: string
  retrying?: boolean
  onRetry?: () => void
}) {
  const router = useRouter()

  return (
    <div className="flex min-h-[500px] w-full flex-1 items-center justify-center p-4 sm:p-8 font-manrope animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c121e] p-8 sm:p-10 text-center shadow-xl">
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#004a80]/15 text-[#004a80] dark:text-blue-300 border border-[#004a80]/30 shadow-md shadow-[#004a80]/10">
          <AlertTriangle size={38} strokeWidth={2.2} />
        </div>

        <span className="rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 font-manrope">
          System Notice
        </span>

        <h2 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-slate-950 dark:text-white">
          {title}
        </h2>

        <p className="mt-3 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400 max-w-md mx-auto">
          {description || "The service encountered an unexpected error. Please try again or return to safety."}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-xl bg-[#004a80] hover:bg-[#003c68] text-white px-5 py-2.5 text-xs font-black shadow-md shadow-[#004a80]/20 transition cursor-pointer"
            >
              <RotateCcw size={15} className={retrying ? "animate-spin" : ""} strokeWidth={2.5} />
              <span>{retrying ? "Retrying..." : "Try Again"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeft size={15} strokeWidth={2.5} />
            <span>Go Back</span>
          </button>
        </div>
      </div>
    </div>
  )
}
