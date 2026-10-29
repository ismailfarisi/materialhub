import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia } from "elysia";
import { container } from "../container.ts";

/**
 * Reels program opt-in / opt-out / status endpoints (M3 Task 8).
 *
 * Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
 * permission-aware `vendorMembership(...)` guards. Status read uses `analytics.read`;
 * opt-in / opt-out require `vendor.profile.write`.
 */
export const vendorReelsProgramRoutes = new Elysia({ prefix: "/vendor/reels-program" })
  .use(container)
  .use(jwtAuth)

  .guard({}, (app) =>
    app.use(vendorMembership("analytics.read")).get("/", async ({ member, vendorService }: any) => {
      const status = await vendorService.getReelsProgramStatus(member.vid);
      return { statusCode: 200, data: status, timestamp: new Date().toISOString() };
    }),
  )

  .guard({}, (app) =>
    app
      .use(vendorMembership("vendor.profile.write"))
      .post("/opt-in", async ({ member, vendorService }: any) => {
        const updated = await vendorService.optIntoReelsProgram(member.vid);
        return {
          statusCode: 200,
          data: {
            joinedAt: updated.reels_program_joined_at,
            commissionRate: updated.reels_commission_rate,
            subsidyEndsAt: updated.reels_subsidy_ends_at,
            isActive: true,
          },
          timestamp: new Date().toISOString(),
        };
      })
      .post("/opt-out", async ({ member, vendorService }: any) => {
        await vendorService.optOutOfReelsProgram(member.vid);
        return {
          statusCode: 200,
          data: { isActive: false },
          timestamp: new Date().toISOString(),
        };
      }),
  );
