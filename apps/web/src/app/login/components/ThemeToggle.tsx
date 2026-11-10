import React from "react"
import { Sun, Moon } from "lucide-react"

export interface ThemeToggleProps {
  isDarkMode: boolean
  toggleDarkMode: () => void
}

export function ThemeToggle({ isDarkMode, toggleDarkMode }: ThemeToggleProps) {
  return (
    <button
      onClick={toggleDarkMode}
      className="absolute top-6 right-6 z-50 p-2.5 rounded-xl border border-[#E7E9ED] dark:border-neutral-800 bg-white/90 dark:bg-card text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-all shadow-2xs hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5A623] backdrop-blur-xs active:scale-95"
      aria-label="Toggle Dark Mode"
      type="button"
    >
      {isDarkMode ? (
        <Sun className="w-4 h-4 text-[#F5A623]" />
      ) : (
        <Moon className="w-4 h-4 text-[#667085]" />
      )}
    </button>
  )
}
