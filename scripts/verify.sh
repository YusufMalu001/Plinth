#!/usr/bin/env bash
# verify.sh — CI gate per PLINTH_REFACTOR.md Addendum #2.
# Runs the four turbo tasks plus ratchet gates for hardcoded colours and banned terms.
# Gates may never increase. STRICT=1 (zero allowed) is enforced only in Phase 10.
#
# Usage:
#   bash scripts/verify.sh                  # full gate check
#   bash scripts/verify.sh --update-baseline   # re-record current counts as baseline (skips enforcement)
#
# Baseline file: scripts/verify-baseline.json (committed; counts may only go down)
set -uo pipefail
cd "$(dirname "$0")/.."

BASELINE="scripts/verify-baseline.json"
MODE="${1:-}"
STRICT="${STRICT:-0}"

fail() { echo "VERIFICATION FAILED: $1" >&2; exit 1; }

# Ratchet count helper: counts case-insensitive occurrences of a regex across
# the given locations (git-tracked files only, artifacts ignored).
count_matches() {
  local pattern="$1"; shift
  git ls-files -z -- "$@" | xargs -0 -r grep -ioE "$pattern" 2>/dev/null | wc -l
}

# --- Ratchet gate definitions -------------------------------------------------
# Colours: hex literals and rgb()/hsl()/oklch() calls in source (not node_modules
# / lockfiles / baselines). Token definition files are allowed and subtracted.
count_colors() {
  git ls-files -z 'apps/web/src/**' 'packages/**' 'services/api/src/**' 'config' 'design' \
    | xargs -0 -r grep -ioE '#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(|hsla?\(|oklch\(' 2>/dev/null | wc -l
}

# Banned brand terms: old product and client identifiers.
count_banned() {
  count_matches 'synergy|aelyx' apps web packages services scripts database infrastructure docs *.json *.md *.yml 2>/dev/null || true
}

get_field() {
  # get_field <field> — reads from baseline JSON (flat { "colors": N, "banned": N })
  node -e "const b=require('./$BASELINE'); console.log(b['$1'] ?? -1);" 2>/dev/null
}

echo "==> ratchet baseline"
COLORS=$(count_colors)
BANNED=$(count_banned)
echo "    colour literals: $COLORS"
echo "    banned terms:    $BANNED"

if [[ "$MODE" == "--update-baseline" ]]; then
  # Baseline update mode: record current counts and skip enforcement.
  if command -v node >/dev/null 2>&1 && [[ -n "$(git ls-files .)" || -n "$(git status --porcelain --untracked-files .)" ]]; then
    node -e "require('fs').writeFileSync('$BASELINE', JSON.stringify({ colors: $COLORS, banned: $BANNED }, null, 2) + '\n')"
    echo "baseline updated: colours=$COLORS banned=$BANNED"
  else
    echo "skipping baseline write: no git files present"
  fi
fi

# --- Turbo tasks ---------------------------------------------------------------
echo "==> turbo typecheck"
npm run --silent typecheck || fail "typecheck"
echo "==> turbo lint"
npm run --silent lint || fail "lint"
echo "==> turbo test"
npm run --silent test || fail "test"
echo "==> turbo build"
npm run --silent build || fail "build"

# --- Ratchet enforcement -------------------------------------------------------
check_ratchet() {
  local name="$1" current="$2" baseline="$3" ceil_strict="$4"
  if [[ "$baseline" == "-1" ]]; then
    echo "    [warn] no baseline for $name (record with --update-baseline)"
    return 0
  fi
  if [[ "$STRICT" == "1" && "$current" != "0" ]]; then
    echo "    [STRICT] $name: $current (expected 0)"
    return 1
  fi
  if [[ "$current" -gt "$baseline" ]]; then
    echo "    [ratchet] $name: current $current > baseline $baseline"
    return 1
  fi
  echo "    [ok] $name: $current (baseline $baseline)"
}

echo "==> ratchet enforcement"
GATE_FAIL=0
if [[ "$MODE" == "--update-baseline" ]]; then
  echo "    [update] enforcement skipped"
  GATE_FAIL=0
fi
check_ratchet "colours" "$COLORS" "$(get_field colors)" 1 || GATE_FAIL=1
check_ratchet "banned"  "$BANNED" "$(get_field banned)"  1 || GATE_FAIL=1
[[ "$GATE_FAIL" == "1" ]] && fail "ratchet gates violated"

echo "VERIFICATION PASSED"
