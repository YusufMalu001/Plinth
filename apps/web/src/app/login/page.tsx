"use client"

import React, { useState } from "react"
import { Logo } from "../../config/brand"
import { useRouter, useSearchParams } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Mail } from "lucide-react"

import { authApi } from "../../features/auth/api"
import { authKeys } from "../../features/auth/hooks"
import { showToast } from "../../components/toast-store"
import { BootSplash, BOOT_TIMINGS } from "../../components/brand/BootSplash"

import { AuthShell } from "./components/AuthShell"
import { LoginCard } from "./components/LoginCard"
import { FormField } from "./components/FormField"
import { PasswordField } from "./components/PasswordField"
import { RememberMeControl } from "./components/RememberMeControl"
import { PrimaryAuthButton } from "./components/PrimaryAuthButton"
import { AuthAlert } from "./components/AuthAlert"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState(searchParams.get('email') ?? "")
  const [password, setPassword] = useState("")
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError("Please enter your credentials")
      showToast({
        kind: "warning",
        title: "Incomplete Credentials",
        message: "Please fill in both email and password fields."
      })
      return
    }

    setIsLoading(true)
    
    try {
      const user = await authApi.login(email, password)
      queryClient.setQueryData(authKeys.me, user)
      showToast({
        kind: "success",
        title: "Access Granted",
        message: "Successfully signed in. Redirecting to workspace..."
      })
      const next = searchParams.get('next')
      const isStaffRole = user.role !== 'admin' && (user.roleDefinition?.key || user.role) !== 'admin';
      const requiresOnboarding = Boolean(user.mustChangePassword) || (isStaffRole && !user.onboardingCompleted);
      if (requiresOnboarding) {
        router.replace('/onboarding')
      } else {
        router.replace(next && next.startsWith('/') ? next : '/')
      }
    } catch (err) {
      const errMsg = (err as Error).message || "Connection failed. Please try again."
      setError(errMsg)
      showToast({
        kind: "error",
        title: "Sign-In Failed",
        message: errMsg
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthShell>
      <LoginCard className="animate-fade-up">
        {/* Brand Logo & Header */}
        <div className="mb-8 select-none">
          <Logo tone="paper" className="text-2xl mb-6 lg:hidden" />
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Welcome back
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            Enter your credentials to access your operations dashboard.
          </p>
        </div>

        {/* Inline Error Alert */}
        {error && <div className="mb-5"><AuthAlert message={error} type="error" /></div>}

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email Address */}
          <FormField
            label="Work Email"
            id="email"
            type="email"
            placeholder="name@plinth.example"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            icon={Mail}
            required
            autoComplete="email"
          />

          {/* Password */}
          <PasswordField
            label="Password"
            id="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
            autoComplete="current-password"
          />

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between text-xs pt-1">
            <RememberMeControl
              id="rememberMe"
              checked={rememberMe}
              onChange={setRememberMe}
              disabled={isLoading}
              label="Remember this device"
            />
            <a
              href="#forgot"
              className="font-semibold text-[#004a80] dark:text-blue-400 hover:text-[#003c68] dark:hover:text-blue-300 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#004a80] rounded"
            >
              Forgot password?
            </a>
          </div>

          {/* Primary Action Button */}
          <PrimaryAuthButton type="submit" loading={isLoading} className="mt-6">
            SIGN IN TO WORKSPACE
          </PrimaryAuthButton>
        </form>
      </LoginCard>
    </AuthShell>
  )
}

const BOOT_FADE_MS = BOOT_TIMINGS.BOOT_FADE_MS;

/**
 * Phase-based boot: phase "boot" renders ONLY the splash — the TechText
 * "PLINTH" reveal plus the acronym sequence (1. Production … 6. Hub). The
 * login screen mounts underneath only when the acronym sequence completes,
 * and the splash unmounts once faded out.
 */
export default function LoginPage() {
  const [phase, setPhase] = useState<'boot' | 'fade' | 'ready'>('boot');

  const handleSequenceComplete = React.useCallback(() => {
    setPhase('fade');
    window.setTimeout(() => setPhase('ready'), BOOT_FADE_MS);
  }, []);

  if (phase === 'boot') {
    return <BootSplash onSequenceComplete={handleSequenceComplete} />;
  }

  return (
    <>
      {phase === 'fade' && <BootSplash fading />}
      <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center text-xs text-muted-foreground">Loading login...</div>}>
        <LoginForm />
      </React.Suspense>
    </>
  )
}
