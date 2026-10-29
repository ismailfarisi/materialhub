import { describe, expect, it } from "bun:test";
import { app } from "../app.ts";

// Route-mounting + guard-wiring test. This does NOT need a database: it asserts
// that each admin path resolves and rejects an unauthenticated caller with 401
// rather than 404. A 404 here means the route module was never mounted in
// app.ts — the failure mode that silently shipped in PR #338.
//
// ORDERING DEPENDENCY (do not rename this file without reading this):
// this is the only test file under src/routes/ that statically imports the
// REAL ../app.ts (on purpose — importing the real app is what proves these
// routes are actually mounted, not just that some stubbed route responds).
//
// This file MUST evaluate (and therefore MUST alphabetically sort) AFTER
// admin-service-offering.auth-wiring.test.ts. That sibling calls
// `mock.module("../container.ts", ...)` AND dynamically imports
// "./admin-service-offering.routes.ts" itself. bun:test's mock.module()
// patches the module registry PROCESS-WIDE, and ESM module instances are
// cached per resolved path — whichever file imports
// "./admin-service-offering.routes.ts" FIRST in this process determines
// which container (real or stubbed) that route module is permanently bound
// to; a later mock.module() call cannot rebind an already-evaluated module.
// So the sibling's assertions (that its stub controller gets invoked) only
// hold if it runs first. The sibling's mock is deliberately kept a superset
// of what app.ts's transitive imports need from ../container.ts (see its
// comment) specifically so that THIS file's later real ../app.ts import
// still evaluates cleanly instead of throwing "Export named 'X' not found"
// (Task 4's original review finding; same bug class as CI incident PR #341).
// If you rename this file or the sibling, you MUST preserve
// "auth-wiring test sorts and runs before this one" — see the longer
// comment in admin-service-offering.auth-wiring.test.ts for the full
// rationale.
async function req(method: string, path: string): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, { method }));
}

const UUID = "11111111-1111-4111-8111-111111111111";

describe("admin service-offering routes are mounted", () => {
  it("GET /admin/service-offerings requires auth (not 404)", async () => {
    const res = await req("GET", "/admin/service-offerings");
    expect(res.status).toBe(401);
  });

  it("GET /admin/service-offerings/:id requires auth (not 404)", async () => {
    const res = await req("GET", `/admin/service-offerings/${UUID}`);
    expect(res.status).toBe(401);
  });

  it("POST /admin/service-offerings/:id/approve requires auth (not 404)", async () => {
    const res = await req("POST", `/admin/service-offerings/${UUID}/approve`);
    expect(res.status).toBe(401);
  });

  it("POST /admin/service-offerings/:id/reject requires auth (not 404)", async () => {
    const res = await req("POST", `/admin/service-offerings/${UUID}/reject`);
    expect(res.status).toBe(401);
  });
});
