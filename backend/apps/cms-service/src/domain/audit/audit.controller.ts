import type { AuditLogQuery } from "@materialhub/dto";
import type { AuditService } from "./audit.service.ts";

export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  async list(query: AuditLogQuery) {
    return this.auditService.list(query);
  }
}
