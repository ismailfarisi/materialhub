import { bulkService, productExportService } from "../container.ts";
import { buildBulkRoutes } from "./bulk.routes.ts";
import { getBulkImageFetchQueue } from "./queues.ts";

export { BulkService } from "./bulk.service.ts";
export { buildBulkRoutes } from "./bulk.routes.ts";
export {
  getJobType,
  isJobTypeImplemented,
  listRegisteredJobTypes,
  registerJobType,
} from "./job-type-registry.ts";
export { getBulkImageFetchQueue, getBulkParentQueue, getProductExportQueue } from "./queues.ts";
export const bulkRoutes = buildBulkRoutes(
  bulkService,
  getBulkImageFetchQueue(),
  productExportService,
);
