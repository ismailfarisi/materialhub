// Preloaded before every unit-test file (see test-ci.sh --preload).
//
// libs/database re-exports 100+ TypeORM entities whose relations reference each
// other. When a test file imports that barrel, the barrel's evaluation can
// interleave with the file's other imports and be observed mid-flight → throw
// "Export named X not found in .../libs/database/src/index.ts" (likewise the
// guards barrel). It's load-order dependent, so it flaps between CI runs.
// Importing the barrels here forces them to evaluate ALONE, to completion,
// before any test file runs — the cached modules are then complete. Combined
// with per-file process isolation, this is deterministic.
import "@materialhub/database";
import "@materialhub/guards";
