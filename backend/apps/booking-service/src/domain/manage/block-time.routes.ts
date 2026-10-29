// block-time.routes.ts
//
// Phase 6 Task 2 (spec off-platform capacity) — POST /manage/blocks, GET
// /manage/blocks, DELETE /manage/blocks/:id. Same guard chain as Task 1's
// /manage/bookings (manual-booking.routes.ts): vendor-scoped (NOT
// admin-only) via `vendorMembership("products.write")` at the route level,
// plus BlockTimeController.create's location-scoped `assertLocationManager`
// check for creation.
import type { EngagementKind } from "@materialhub/database";
import { CreateBlockBody } from "@materialhub/dto";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../../container.ts";

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});

// `.use(jwtAuth)` is explicit here for the same reason
// manual-booking.routes.ts's is: this route's auth shouldn't depend on mount
// order elsewhere (harmless if Elysia's plugin dedup-by-name also hoists it
// from a sibling route module).
export const blockTimeRoutes = new Elysia({ prefix: "/manage" })
  .use(container)
  .use(jwtAuth)
  .guard({}, (app) =>
    app
      .use(vendorMembership("products.write"))
      .post(
        "/blocks",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ body, user, member, blockTimeController, set }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await blockTimeController.create(actor, {
            ...body,
            // The DTO's literal union ("manual_block" | "break") carries the
            // same string values as EngagementKind — cast at this one
            // boundary rather than threading a plain-string type through the
            // controller/service/EngagementService.reserve chain.
            kind: body.kind as EngagementKind,
          });
          set.status = 201;
          return ok(data, 201);
        },
        { body: CreateBlockBody },
      )
      .get(
        "/blocks",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ query, user, member, blockTimeController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          const data = await blockTimeController.list(actor, query);
          return ok(data);
        },
      )
      .delete(
        "/blocks/:id",
        // biome-ignore lint/suspicious/noExplicitAny: guarded context is loosely typed
        async ({ params, user, member, blockTimeController }: any) => {
          const actor = { userId: user.id, vendorId: member.vid, role: member.r };
          await blockTimeController.delete(actor, params.id);
          return ok({ deleted: true });
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      ),
  );
