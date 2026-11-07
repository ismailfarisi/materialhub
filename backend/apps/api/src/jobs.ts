/**
 * Start every module's boot-time background work (timers, BullMQ workers and
 * repeatable jobs). BullMQ workers that modules create at import time
 * (order, notification, product bulk, integration dispatcher) are already
 * running once ./modules.ts has been imported.
 *
 * The job starters are imported lazily, on purpose: each former service
 * loaded its `app.ts` before its jobs (and so before `container.ts`), and
 * some modules have import cycles that only resolve in that order (product:
 * container -> bulk/index -> container). A static import here would be
 * hoisted and load a container first.
 */
export async function startAllJobs(): Promise<void> {
  const [auth, product, vendor, notification, cms, integration] = await Promise.all([
    import("../../auth-service/src/jobs.ts"),
    import("../../product-service/src/jobs.ts"),
    import("../../vendor-service/src/jobs.ts"),
    import("../../notification-service/src/jobs.ts"),
    import("../../cms-service/src/jobs.ts"),
    import("../../integration-service/src/jobs.ts"),
  ]);
  auth.startAuthJobs();
  product.startProductJobs();
  vendor.startVendorJobs();
  notification.startNotificationJobs();
  cms.startCmsJobs();
  await integration.startIntegrationJobs();
}
