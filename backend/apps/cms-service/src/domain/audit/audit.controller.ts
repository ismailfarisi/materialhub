import type { AuditListQuery, AuditService } from "./audit.service.ts";

export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  async list(query: AuditListQuery) {
    return this.auditService.list(query);
  }

  async facets() {
    return this.auditService.facets();
  }
}
