#!/usr/bin/env bash
# CI test runner — UNIT TESTS ONLY.
#
# The PR/prod pipelines have no Postgres or Redis, so integration tests
# (*.integration.test.ts and tests/integration/**) cannot run here. Loading a
# whole service's suite in one bun process also surfaces a load-order
# circular-import in @materialhub/guards that only bites when the integration
# files are present. Both problems are avoided by running unit tests only.
#
# Integration tests should be run separately against a live stack (tracked as
# future CI-infra work: add Postgres + Redis service containers and a
# `test:integration` step). Run them locally with `bun test` (full suite) when
# your docker stack is up.
#
# Runs from the repo root (where the workflows invoke it). Each service runs in
# its own bun process to preserve per-service isolation.
set -uo pipefail

APPS=(
  api-gateway
  auth-service
  product-service
  order-service
  vendor-service
  notification-service
  cms-service
  integration-service
)

# Running total of integration files CI did NOT run, reported at the end. A
# green check here covers unit tests only.
excluded_total=0

# Two complementary measures make this deterministic:
#   1. --preload fully evaluates the libs/database + guards barrels (100+
#      interlinked TypeORM entities) BEFORE the test file's own imports, so the
#      barrel is never observed mid-evaluation ("Export named X not found").
#   2. Each test FILE runs in its own bun process, so a route test that
#      mock.module("../container.ts")s always wins — no sibling file can load the
#      container first and defeat the mock.
# Either alone flaps between CI runs; together they are stable.
PRELOAD="$PWD/backend/scripts/test-preload.ts"

fail=0
for app in "${APPS[@]}"; do
  dir="backend/apps/$app"
  if [ ! -d "$dir" ]; then
    echo "::warning::skipping missing $dir"
    continue
  fi
  # Unit test files only: exclude *.integration.test.ts and tests/integration/**.
  mapfile -t files < <(cd "$dir" && git ls-files '*.test.ts' ':!*.integration.test.ts' ':!tests/integration/*')
  mapfile -t skipped < <(cd "$dir" && git ls-files '*.integration.test.ts' 'tests/integration/*')
  excluded_total=$(( excluded_total + ${#skipped[@]} ))
  if [ "${#files[@]}" -eq 0 ]; then
    echo "▸ $app: no unit tests (${#skipped[@]} integration file(s) NOT run)"
    continue
  fi
  echo "▸ $app: ${#files[@]} unit test file(s), ${#skipped[@]} integration file(s) NOT run"
  app_fail=0
  for f in "${files[@]}"; do
    if ! ( cd "$dir" && bun test --preload "$PRELOAD" "$f" ); then
      app_fail=1
    fi
  done
  if [ "$app_fail" -ne 0 ]; then
    echo "::error::unit tests failed in $app"
    fail=1
  fi
done

echo
echo "──────────────────────────────────────────────────────────────────"
echo "UNIT TESTS ONLY. ${excluded_total} integration test file(s) were NOT run."
echo "A pass here does NOT cover DB-backed flows (order money movement,"
echo "state-machine transitions, carrier/webhook paths). Run those against a"
echo "live stack: docker compose up, then \`bun test\` from backend/apps/<svc>"
echo "──────────────────────────────────────────────────────────────────"

exit $fail
