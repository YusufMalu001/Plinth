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
      className={`flex items-start gap-3 p-4 rounded-card border text-[13px] leading-relaxed transition-all duration-200 ${
        type === "error"
          ? "bg-tone-red-bg border-tone-red-solid/25 text-tone-red-text"
          : "bg-tone-green-bg border-tone-green-solid/25 text-tone-green-text"
      }`}
    >
      <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${type === "error" ? "text-tone-red-solid" : "text-tone-green-solid"}`} strokeWidth={2} />
      <div className="flex-1">
        <span className="font-semibold block text-ink mb-0.5">
          {type === "error" ? "Authentication Failure" : "Success"}
        </span>
        <span className="font-medium">{displayMessage}</span>
      </div>
    </div>
  )
}
