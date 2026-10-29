import { BulkImportMode, BulkJobFileFormat, BulkJobStatus, BulkJobType } from "@materialhub/database";
import { Type } from "@sinclair/typebox";

export const InitiateUploadBody = Type.Object({
  jobType: Type.Enum(BulkJobType),
  fileName: Type.String({ minLength: 1, maxLength: 256 }),
  fileSizeBytes: Type.Integer({ minimum: 1, maximum: 25 * 1024 * 1024 }),
  fileFormat: Type.Enum(BulkJobFileFormat),
  targetVendorId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  mode: Type.Optional(Type.Enum(BulkImportMode)),
});

export const InitiateUploadResponse = Type.Object({
  jobId: Type.String({ format: "uuid" }),
  presignedUrl: Type.String(),
  s3Key: Type.String(),
  expiresAt: Type.String(),
});

export const JobIdParam = Type.Object({ id: Type.String({ format: "uuid" }) });

export const JobSummary = Type.Object({
  id: Type.String(),
  jobType: Type.Enum(BulkJobType),
  status: Type.Enum(BulkJobStatus),
  vendorId: Type.Union([Type.String(), Type.Null()]),
  fileName: Type.String(),
  totalRows: Type.Union([Type.Integer(), Type.Null()]),
  processedRows: Type.Integer(),
  succeededRows: Type.Integer(),
  skippedRows: Type.Integer(),
  imagesTotal: Type.Integer(),
  imagesProcessed: Type.Integer(),
  imagesFailed: Type.Integer(),
  createdAt: Type.String(),
  startedAt: Type.Union([Type.String(), Type.Null()]),
  completedAt: Type.Union([Type.String(), Type.Null()]),
});

export const JobListQuery = Type.Object({
  jobType: Type.Optional(Type.Enum(BulkJobType)),
  status: Type.Optional(Type.Enum(BulkJobStatus)),
  vendorId: Type.Optional(Type.String({ format: "uuid" })),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});

export const JobListResponse = Type.Object({
  items: Type.Array(JobSummary),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});

export const TemplateFormatQuery = Type.Object({
  format: Type.Union([Type.Literal("csv"), Type.Literal("xlsx")]),
  categorySlugs: Type.Optional(Type.String({ maxLength: 2000 })),
});

export const TemplateJobTypeParam = Type.Object({
  jobType: Type.Enum(BulkJobType),
});

export const ChangesQuery = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
});
