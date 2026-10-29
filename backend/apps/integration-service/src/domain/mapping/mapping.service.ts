import type {
  AuditLog,
  IntegrationDirection,
  IntegrationEventType,
  VendorIntegrationMapping,
} from "@materialhub/database";
import { transform, validateSpec } from "@materialhub/integration-mapper";
import type { Repository } from "typeorm";

export class MappingService {
  constructor(
    private repo: Repository<VendorIntegrationMapping>,
    private auditRepo?: Repository<AuditLog>,
  ) {}

  async upsert(input: {
    integration_id: string;
    event_type: IntegrationEventType;
    direction: IntegrationDirection;
    spec: Record<string, unknown>;
    is_enabled?: boolean;
  }): Promise<{
    mapping: VendorIntegrationMapping | null;
    preview: Record<string, unknown> | null;
    errors: string[];
  }> {
    const v = validateSpec(input.spec);
    if (!v.ok) return { mapping: null, preview: null, errors: v.errors };
    const existing = await this.repo.findOne({
      where: {
        integration_id: input.integration_id,
        event_type: input.event_type,
        direction: input.direction,
        deleted_at: null as any,
      },
    });
    const saved = await this.repo.save({
      ...(existing ?? {}),
      integration_id: input.integration_id,
      event_type: input.event_type,
      direction: input.direction,
      spec: input.spec,
      is_enabled: input.is_enabled ?? true,
    } as any);
    if (this.auditRepo) {
      try {
        await this.auditRepo.save({
          actor_id: null,
          actor_role: "vendor",
          action: existing ? "mapping_update" : "mapping_create",
          entity_type: "vendor_integration_mapping",
          entity_id: (saved as any).id,
          changes: {
            before: existing?.spec ?? null,
            after: input.spec,
          },
        } as any);
      } catch (e) {
        console.error("[audit] mapping audit emit failed", {
          action: existing ? "mapping_update" : "mapping_create",
          error: (e as Error)?.message,
        });
      }
    }
    let preview: Record<string, unknown> | null = null;
    try {
      preview = transform(input.spec as any, samplePayload(input.event_type));
    } catch {
      preview = null;
    }
    return { mapping: saved as any, preview, errors: [] };
  }

  list(integrationId: string) {
    return this.repo.find({
      where: { integration_id: integrationId, deleted_at: null as any },
    });
  }
}

function samplePayload(_event: IntegrationEventType): Record<string, unknown> {
  // Synthetic example; replaced by sample-payload route in Plan 3 with real recent data.
  return {
    vendor_order: { vendor_order_number: "VO-EXAMPLE", status: "shipped", vendor_total: 12345 },
    order: { user: { email: "user@example.com", first_name: "Aisha", last_name: "Khan" } },
    shipment: { tracking_number: "TRK-EXAMPLE", delivered_at: "2026-04-27T10:00:00Z" },
  };
}
