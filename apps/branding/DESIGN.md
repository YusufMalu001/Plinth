# Plinth Branding Website Design System & Architecture

## 1. Ground Rules & Foundations
- **Authority**: `PLINTH_THEME.txt` in the repository root is the exclusive single source of truth for colors, typography, border radius, spacing, and shadows.
- **Palette**: Strictly light theme only. Zero gradients, zero glassmorphism, zero stock photos.
- **Button Tokens**:
  - Primary button: Solid Black (`bg-inverse`, `#171717`) with white text (`text-surface`).
  - Secondary button: Subtle border (`bg-surface`, `border-border`, `text-ink`).
- **Accent & Semantics**:
  - Accent: `#0D9488` (Teal 600) used strictly for interactive highlights, active tabs, and badges.
  - Success: `#059669` (Green 600) / `#ECFDF5` for "Available" pills.
  - Warning: `#D97706` (Amber 600) / `#FFFBEB` for legal review banners.
  - Muted: `#64748B` (Slate 500) / `#F1F5F9` for "Coming Soon" pills.

## 2. Typography
- **Primary Sans-Serif**: `Plus Jakarta Sans` self-hosted via `@fontsource/plus-jakarta-sans` (400, 500, 600, 700 weights).
- **Monospace**: `JetBrains Mono` self-hosted via `@fontsource/jetbrains-mono` (400, 500) for operational codes, SKUs, numbers, and pills.

## 3. Honesty & Compliance Rules
- **No Invented Proof**: Zero fabricated customer logos, fake case studies, or artificial statistics. Unproven metrics display "Case study coming soon".
- **Forbidden Terminology**: Strictly forbidden by rule 4: `FDA compliant`, `GMP compliant`, `21 CFR Part 11 compliant`, `certified`.
- **Approved Claims**:
  - Headline: "STRUCTURED OPERATIONS. ACCOUNTABLE OUTPUT."
  - Subline: "The operations platform for businesses that make, move and sell."
  - Pricing: "Flat monthly subscription per plant. Not per user." (From ₹7,000/mo on Manufacturing & Pricing).
  - AI Safety: "An AI operator that drafts the work from a plain-language request. Every change is previewed before it is saved, limited to the user's role, and recorded in the audit trail."

## 4. Prerendering & SEO
- Every route is statically prerendered to real HTML at build time (`dist/<route>/index.html`) using static routing.
- React Helmet Async injects title, description, canonical link, OpenGraph tags, and JSON-LD `SoftwareApplication` structured metadata.
