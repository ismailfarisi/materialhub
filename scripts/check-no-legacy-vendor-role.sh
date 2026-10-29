#!/usr/bin/env bash
# Phase 3a verification: ensure no legacy vendor-role references survived
# the vendor-membership cutover.
#
# Fails (exit 1) if any of these forbidden patterns appear in production
# (non-test) code:
#   - vendorOwnership / vendorLayoutOwnership (deleted guards)
#   - UserRole.vendor (dropped enum value)
#   - requireRole("vendor") (dropped role string)
#   - role === "vendor" (legacy auth dispatch)
#
# Special case: `role: "vendor"` (object literal, not user role) is
# allowed inside known internal audit/event-label files. Those tag
# audit_log rows; they're descriptive labels, not auth.

set -euo pipefail

cd "$(dirname "$0")/.."

PRODUCTION_GLOBS=(
  "backend/apps/*/src/**/*.ts"
  "backend/libs/*/src/**/*.ts"
)

# Patterns that are forbidden in any non-test production file.
# Note: we look for usage patterns (imports, identifier-followed-by-paren)
# rather than bare identifiers, so historical migration-note comments
# don't trip the gate.
#
# `role === "vendor"` is intentionally NOT in this list — typecheck already
# rejects it when the role field is `UserRole`-typed. The remaining instances
# are internal `actor.role === "vendor"` comparisons in audit-label files
# (shipment-tracking, order-status), which use a separate `"vendor" | "admin"`
# type that is explicitly out of Phase 3a scope.
BAD_PATTERNS=(
  'import\s*\{[^}]*\bvendorOwnership\b'
  'import\s*\{[^}]*\bvendorLayoutOwnership\b'
  '\.use\(vendorOwnership'
  '\.use\(vendorLayoutOwnership'
  'UserRole\.vendor\b'
  'requireRole\(\s*"vendor"'
)

# `role: "vendor"` is only allowed in these files (internal audit labels).
ALLOWED_AUDIT_LABEL_FILES=(
  "shipment-tracking.routes.ts"
  "shipment-tracking.service.ts"
  "shipment-tracking.controller.ts"
  "auto-shipment.job.ts"
  "internal-vendor-orders.routes.ts"
  "internal-shipments.routes.ts"
  "vendor-order.controller.ts"
  "integration.service.ts"
  "mapping.service.ts"
  "order-status.service.ts"
  # booking-service: `BookingActorRole` is a service-local union
  # ("customer" | "vendor" | "admin" | "system"), not `UserRole` — same
  # out-of-Phase-3a-scope case as the shipment/order audit files above.
  # `actor_role` is a varchar audit column on booking_status_history.
  "manual-booking.service.ts"
  "manage-booking-actions.controller.ts"
)

# Use the binary `rg` — explicitly avoid shell aliases/functions.
# CI runners (Ubuntu) ship ripgrep at /usr/bin/rg.
# Local Windows devs can install ripgrep via `winget install BurntSushi.ripgrep.MSVC`.
RG_BIN=""
for candidate in /usr/bin/rg /usr/local/bin/rg /opt/homebrew/bin/rg; do
  if [ -x "$candidate" ]; then
    RG_BIN="$candidate"
    break
  fi
done
if [ -z "$RG_BIN" ]; then
  # Fall back to PATH search for the binary, bypassing shell aliases/functions.
  RG_BIN=$(command -v rg 2>/dev/null || true)
fi
if [ -z "$RG_BIN" ] || [ ! -x "$RG_BIN" ]; then
  echo "Need ripgrep (rg) binary on PATH. Install via your package manager." >&2
  echo "  Ubuntu/Debian: apt-get install ripgrep" >&2
  echo "  macOS:         brew install ripgrep" >&2
  echo "  Windows:       winget install BurntSushi.ripgrep.MSVC" >&2
  exit 2
fi
RG="$RG_BIN"

failed=0

# 1) Forbidden symbol patterns — exclude tests AND single-line comments.
for pattern in "${BAD_PATTERNS[@]}"; do
  # `-n` = line numbers, `-N` = no, here we want full file:line:match output
  # so we can post-filter lines that are pure `//` comments.
  matches=$(
    $RG --no-messages "$pattern" backend/apps backend/libs --type ts -n 2>/dev/null \
      | grep -v ':[0-9]*:\s*//' \
      | grep -v ':[0-9]*:\s*\*' \
      | cut -d: -f1 \
      | sort -u \
      | grep -v '\.test\.ts$' \
      | grep -v '\.integration\.test\.ts$' \
      || true
  )
  if [ -n "$matches" ]; then
    echo "FORBIDDEN: pattern '$pattern' found in production code:"
    echo "$matches"
    failed=1
  fi
done

# 2) `role: "vendor"` — allowed only in audit-label files.
audit_violations=$(
  $RG --no-messages 'role:\s*"vendor"' backend/apps backend/libs --type ts -l 2>/dev/null \
    | grep -v '\.test\.ts$' \
    | grep -v '\.integration\.test\.ts$' \
    || true
)
for f in $audit_violations; do
  base=$(basename "$f")
  allowed=0
  for a in "${ALLOWED_AUDIT_LABEL_FILES[@]}"; do
    if [ "$base" = "$a" ]; then
      allowed=1
      break
    fi
  done
  if [ "$allowed" -eq 0 ]; then
    echo "FORBIDDEN: 'role: \"vendor\"' in $f (not in allowed audit-label list)"
    failed=1
  fi
done

if [ "$failed" -eq 1 ]; then
  echo
  echo "Fix the violations above. See docs/superpowers/specs/2026-05-08-vendor-membership-phase3a-design.md §5."
  exit 1
fi

echo "OK: no forbidden legacy vendor-role references in production code."
