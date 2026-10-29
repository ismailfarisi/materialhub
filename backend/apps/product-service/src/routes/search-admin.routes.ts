import { jwtAuth, requireRole } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { enqueueSearchReindex } from "../domain/search/search-reindex.job.ts";

export const searchAdminRoutes = new Elysia({ prefix: "/admin/search" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))

  .post("/reindex", async ({ searchReindexQueue, user, set }) => {
    // Reject if a reindex is already running — avoids two concurrent
    // "drop + recreate" jobs stepping on each other.
    const active = await searchReindexQueue.getActive();
    const running = active[0];
    if (running) {
      set.status = 409;
      return {
        statusCode: 409,
        error: "REINDEX_IN_PROGRESS",
        message: "A reindex is already running",
        data: { jobId: running.id },
        timestamp: new Date().toISOString(),
      };
    }

    const jobId = await enqueueSearchReindex((user as { id?: string } | null)?.id ?? null);
    set.status = 202;
    return {
      statusCode: 202,
      data: { jobId },
      timestamp: new Date().toISOString(),
    };
  })

  .get(
    "/reindex/:jobId",
    async ({ params, searchReindexQueue }) => {
      const job = await searchReindexQueue.getJob(params.jobId);
      if (!job) {
        throw new HttpError(404, "Reindex job not found", "REINDEX_JOB_NOT_FOUND");
      }
      const state = await job.getState();
      const progress = job.progress as
        | { processed: number; total: number; percent: number }
        | number
        | undefined;
      const returnValue = job.returnvalue as { processed: number; durationMs: number } | undefined;
      const failedReason = job.failedReason ?? null;

      return {
        statusCode: 200,
        data: {
          jobId: job.id,
          name: job.name,
          state,
          progress: typeof progress === "object" ? progress : null,
          result: returnValue ?? null,
          failedReason,
          startedAt: job.processedOn ?? null,
          finishedAt: job.finishedOn ?? null,
        },
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ jobId: t.String({ minLength: 1 }) }) },
  )

  .get("/reindex", async ({ searchReindexQueue }) => {
    // Latest jobs across all lifecycle states — lets the admin UI show
    // the most recent attempt on page load without needing a jobId.
    const [waiting, active, completed, failed] = await Promise.all([
      searchReindexQueue.getWaiting(0, 0),
      searchReindexQueue.getActive(0, 0),
      searchReindexQueue.getCompleted(0, 0),
      searchReindexQueue.getFailed(0, 0),
    ]);
    const latest =
      active[0] ??
      waiting[0] ??
      [...completed, ...failed].sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0))[0];

    if (!latest) {
      return {
        statusCode: 200,
        data: { jobId: null, state: null },
        timestamp: new Date().toISOString(),
      };
    }

    const state = await latest.getState();
    const progress = latest.progress as
      | { processed: number; total: number; percent: number }
      | number
      | undefined;
    const returnValue = latest.returnvalue as { processed: number; durationMs: number } | undefined;

    return {
      statusCode: 200,
      data: {
        jobId: latest.id,
        name: latest.name,
        state,
        progress: typeof progress === "object" ? progress : null,
        result: returnValue ?? null,
        failedReason: latest.failedReason ?? null,
        startedAt: latest.processedOn ?? null,
        finishedAt: latest.finishedOn ?? null,
      },
      timestamp: new Date().toISOString(),
    };
  });
