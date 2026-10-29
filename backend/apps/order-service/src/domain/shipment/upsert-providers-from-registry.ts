import type { ShippingProvider } from "@materialhub/database/src/entities/shipping-provider.entity.ts";
import type { Repository } from "typeorm";
import type { ShippingProviderRegistry } from "./shipping-provider-adapter.ts";

export async function upsertProvidersFromRegistry(
  registry: ShippingProviderRegistry,
  repo: Repository<ShippingProvider>,
): Promise<void> {
  for (const adapter of registry.list()) {
    const existing = await repo.findOne({ where: { code: adapter.code } });
    if (!existing) {
      await repo.save({
        code: adapter.code,
        display_name: adapter.displayName,
        description: null,
        logo_url: null,
        credential_schema: adapter.credentialSchema as unknown as Record<string, unknown>,
        supported_regions: [],
        webhook_secret_encrypted: null,
        is_active: false,
        sort_order: 0,
      });
      continue;
    }
    existing.credential_schema = adapter.credentialSchema as unknown as Record<string, unknown>;
    await repo.save(existing);
  }
}
