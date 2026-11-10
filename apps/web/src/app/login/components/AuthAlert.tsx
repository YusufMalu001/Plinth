import React from "react"
import { AlertTriangle } from "lucide-react"

export interface AuthAlertProps {
  message?: string | null
  type?: "error" | "success"
}

export function AuthAlert({ message, type = "error" }: AuthAlertProps) {
  if (!message) return null

  // Ensure we display user-friendly errors
  let displayMessage = message
  if (
    message.toLowerCase().includes("database") ||
    message.toLowerCase().includes("sql") ||
    message.toLowerCase().includes("connection") ||
    message.toLowerCase().includes("fetch") ||
    message.toLowerCase().includes("network")
  ) {
    displayMessage = "Unable to connect to your workspace. Please try again or contact your administrator."
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-start gap-3 p-4 rounded-xl border text-[13px] leading-relaxed transition-all duration-200 ${
        type === "error"
          ? "bg-[#FFF9EF] border-destructive/30 text-destructive dark:bg-destructive/10 dark:border-destructive/20"
          : "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400"
      }`}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" strokeWidth={2} />
      <div className="flex-1">
        <span className="font-semibold block text-neutral-900 dark:text-white mb-0.5">
          {type === "error" ? "Authentication Failure" : "Success"}
        </span>
        <span className="font-medium">{displayMessage}</span>
      </div>
    </div>
  )
}
