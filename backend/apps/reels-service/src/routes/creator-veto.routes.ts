import { AppDataSource, type CreatorApplicationStatus, SiteSetting } from "@materialhub/database";
import { CreatorApplicationListQuery, CreatorApplicationReviewBody } from "@materialhub/dto";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/**
 * Admin endpoints for the creator-graduation veto window.
 *
 * An admin (or super_admin) can:
 *  - GET  /admin/creators/pending-veto       — list creators whose
 *    auto-graduation happened within the current veto window (default 48h,
 *    configurable via site_settings.reels_admin_veto_window_hours).
 *  - POST /admin/creators/:userId/veto       — demote a graduated creator
 *    back to `regular` and write an audit row. The underlying
 *    GraduationService is transactional and idempotent: a second call
 *    targeting an already-regular user returns 404.
 *
 * Role gating: `admin` and `super_admin` only. No moderator role exists in
 * the UserRole union (see `backend/libs/guards/src/index.ts`).
 */

async function getVetoWindowHours(): Promise<number> {
  const row = await AppDataSource.getRepository(SiteSetting).findOne({
    where: { key: "reels_admin_veto_window_hours" },
  });
  // Guard against NaN / non-positive values from a misconfigured row.
  // Without this, Number("forty-eight") = NaN silently returns an empty
  // candidate list instead of falling back to the 48h default.
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 48;
}

// biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the veto-route pattern
function mapReviewError(err: unknown, set: any) {
  if (err instanceof Error) {
    const map: Record<string, number> = {
      application_not_found: 404,
      application_not_reviewable: 409,
    };
    const code = map[err.message];
    if (code) {
      set.status = code;
      return { statusCode: code, error: err.message, timestamp: new Date().toISOString() };
    }
  }
  throw err;
}

export const creatorVetoRoutes = new Elysia({ prefix: "/admin/creators" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get("/pending-veto", async ({ graduationService }: any) => {
    const windowHours = await getVetoWindowHours();
    const items = await graduationService.listVetoCandidates(windowHours);
    return {
      statusCode: 200,
      items,
      timestamp: new Date().toISOString(),
    };
  })
  .post(
    "/:userId/veto",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the veto-route pattern
    async ({ params, body, user, graduationService, set }: any) => {
      try {
        await graduationService.vetoCreator(params.userId, user.id, user.role, body.reason);
        return {
          statusCode: 200,
          data: { userId: params.userId, vetoed: true },
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        // GraduationService throws a single combined error when the user
        // doesn't exist OR has already been demoted (concurrent vetoes).
        // Both cases are "nothing to do" from the client's perspective —
        // map to 404. Matches the envelope-return convention used in
        // creator-dashboard.routes.ts (payout error case).
        if (err instanceof Error && err.message === "user_not_found_or_already_regular") {
          set.status = 404;
          return {
            statusCode: 404,
            error: err.message,
            timestamp: new Date().toISOString(),
          };
        }
        throw err;
      }
    },
    {
      params: t.Object({ userId: t.String({ format: "uuid" }) }),
      body: t.Object({ reason: t.String({ minLength: 1 }) }),
    },
  )
  .get(
    "/applications",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the veto-route pattern
    async ({ query, creatorApplicationService }: any) => {
      const status =
        query.status && query.status !== "__all__"
          ? (query.status as CreatorApplicationStatus)
          : undefined;
      const page = query.page ? Number(query.page) : 1;
      const limit = query.limit ? Number(query.limit) : 20;
      const result = await creatorApplicationService.listForReview({ status, page, limit });
      return { statusCode: 200, ...result, timestamp: new Date().toISOString() };
    },
    { query: CreatorApplicationListQuery },
  )
  .get(
    "/applications/:id",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the veto-route pattern
    async ({ params, creatorApplicationService, set }: any) => {
      const app = await creatorApplicationService.getById(params.id);
      if (!app) {
        set.status = 404;
        return {
          statusCode: 404,
          error: "application_not_found",
          timestamp: new Date().toISOString(),
        };
      }
      return { statusCode: 200, data: app, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/applications/:id/approve",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the veto-route pattern
    async ({ params, user, creatorApplicationService, set }: any) => {
      try {
        const app = await creatorApplicationService.approve(params.id, user.id, user.role);
        return { statusCode: 200, data: app, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapReviewError(err, set);
      }
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/applications/:id/reject",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the veto-route pattern
    async ({ params, body, user, creatorApplicationService, set }: any) => {
      try {
        const app = await creatorApplicationService.reject(
          params.id,
          user.id,
          user.role,
          body.notes ?? null,
        );
        return { statusCode: 200, data: app, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapReviewError(err, set);
      }
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }), body: CreatorApplicationReviewBody },
  )
  .post(
    "/applications/:id/request-info",
    // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the veto-route pattern
    async ({ params, body, user, creatorApplicationService, set }: any) => {
      try {
        const app = await creatorApplicationService.requestInfo(
          params.id,
          user.id,
          user.role,
          body.notes ?? null,
        );
        return { statusCode: 200, data: app, timestamp: new Date().toISOString() };
      } catch (err) {
        return mapReviewError(err, set);
      }
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }), body: CreatorApplicationReviewBody },
  );
