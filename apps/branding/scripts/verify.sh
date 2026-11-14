#!/usr/bin/env bash
set -e

echo "=== Plinth Branding Site Verification Suite ==="

echo "Step 1: Auditing theme tokens and honesty compliance..."
node scripts/check-theme-tokens.js

echo "Step 2: TypeScript typecheck (strict)..."
npx tsc --noEmit

echo "Step 3: Unit tests (Vitest)..."
npm test -- --run

echo "Step 4: Building client, SSR bundle, and static prerender (SSG)..."
npm run build

echo "Step 5: Verifying prerendered HTML content..."
test -f dist/index.html
test -f dist/products/index.html
test -f dist/products/manufacturing/index.html
test -f dist/platform/index.html
test -f dist/pricing/index.html
test -f dist/demo/index.html
test -f dist/sitemap.xml
test -f dist/robots.txt
grep -q "STRUCTURED OPERATIONS. ACCOUNTABLE OUTPUT." dist/index.html
grep -q "Plinth Manufacturing" dist/products/manufacturing/index.html
grep -q "Flat monthly subscription per plant" dist/pricing/index.html

echo "Step 6: Running Playwright E2E and visual tests..."
npx playwright test

echo "=== All verification checks passed successfully! ==="
