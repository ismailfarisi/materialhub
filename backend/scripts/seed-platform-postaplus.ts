#!/usr/bin/env bun
/**
 * Create or update the PLATFORM PostaPlus carrier account — the
 * vendor_carrier_accounts row with vendor_id NULL that every vendor ships
 * through by default (vendors only add their own account to override it).
 *
 * Reads credentials from env:
 *   POSTAPLUS_PARTNER_KEY  (required)
 *   POSTAPLUS_TENANT       (required, e.g. DXB)
 *   POSTAPLUS_CUSTOMER     (required, e.g. CR26006559)
 *   POSTAPLUS_CREATED_BY   (required, e.g. POSTACLNT)
 *   POSTAPLUS_BASE_URL     (optional — set for the dev/test endpoint)
 *
 * Usage: bun --env-file=.env scripts/seed-platform-postaplus.ts
 */

import { config } from "@materialhub/config";
import { AppDataSource, ShippingProvider, VendorCarrierAccount } from "@materialhub/database";
import { EncryptionService } from "@materialhub/utils";
import { IsNull } from "typeorm";

async function main() {
  const creds: Record<string, string> = {
    partner_key: process.env.POSTAPLUS_PARTNER_KEY ?? "",
    tenant: process.env.POSTAPLUS_TENANT ?? "",
    customer: process.env.POSTAPLUS_CUSTOMER ?? "",
    created_by: process.env.POSTAPLUS_CREATED_BY ?? "",
  };
  if (process.env.POSTAPLUS_BASE_URL) creds.base_url = process.env.POSTAPLUS_BASE_URL;

  const missing = ["partner_key", "tenant", "customer", "created_by"].filter((k) => !creds[k]);
  if (missing.length) {
    console.error(`Missing env credentials: ${missing.join(", ")}`);
    process.exit(1);
  }

  await AppDataSource.initialize();
  const encryption = new EncryptionService(config.encryption.key);
  const providerRepo = AppDataSource.getRepository(ShippingProvider);
  const accountRepo = AppDataSource.getRepository(VendorCarrierAccount);

  const provider = await providerRepo.findOne({ where: { code: "postaplus" } });
  if (!provider) {
    console.error("PostaPlus provider not registered — start order-service once first.");
    await AppDataSource.destroy();
    process.exit(1);
  }
  if (!provider.is_active) {
    await providerRepo.update(provider.id, { is_active: true });
    console.log("[ok] activated the postaplus shipping provider");
  }

  const encrypted = encryption.encryptObject(creds);
  const last4 = creds.partner_key.slice(-4);
  const existing = await accountRepo.findOne({
    where: { vendor_id: IsNull(), provider_id: provider.id },
  });

  if (existing) {
    await accountRepo.update(existing.id, {
      credentials_encrypted: encrypted,
      credentials_last4: last4,
      is_active: true,
      is_verified: true,
      verified_at: new Date(),
      last_verify_error: null,
    });
    console.log(`[ok] updated platform PostaPlus account ${existing.id}`);
  } else {
    const saved = await accountRepo.save({
      vendor_id: null,
      provider_id: provider.id,
      display_name: "MaterialHub PostaPlus (platform default)",
      credentials_encrypted: encrypted,
      credentials_last4: last4,
      is_active: true,
      is_verified: true,
      verified_at: new Date(),
    });
    console.log(`[ok] created platform PostaPlus account ${saved.id}`);
  }

  await AppDataSource.destroy();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
