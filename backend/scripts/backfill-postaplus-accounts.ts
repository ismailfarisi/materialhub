#!/usr/bin/env bun
/**
 * Backfill script — run ONCE after deploying the vendor 3PL integrations feature.
 *
 * For every vendor with `default_carrier = 'postaplus'` in the legacy column,
 * create a `vendor_carrier_accounts` row using the platform-wide PostaPlus
 * credentials from env vars, mark verified+active, and point the vendor's
 * `default_shipping_account_id` at it.
 *
 * After this script runs, email the affected vendors asking them to replace
 * the shared creds with their own. After T+2 weeks, a follow-up migration
 * drops the shared-creds rows that vendors haven't replaced.
 */

import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { ShippingProvider, Vendor, VendorCarrierAccount } from "@materialhub/database";
import { EncryptionService } from "@materialhub/utils";

async function main() {
  await AppDataSource.initialize();
  const encryption = new EncryptionService(config.encryption.key);

  const apiKey = process.env.POSTAPLUS_API_KEY;
  const accountNumber = process.env.POSTAPLUS_ACCOUNT_NUMBER;
  if (!apiKey || !accountNumber) {
    console.log("No legacy POSTAPLUS_API_KEY/ACCOUNT_NUMBER env vars — nothing to backfill.");
    await AppDataSource.destroy();
    return;
  }

  const providerRepo = AppDataSource.getRepository(ShippingProvider);
  const vendorRepo = AppDataSource.getRepository(Vendor);
  const accountRepo = AppDataSource.getRepository(VendorCarrierAccount);

  const provider = await providerRepo.findOne({ where: { code: "postaplus" } });
  if (!provider) {
    console.error(
      "PostaPlus provider not registered. Ensure container.ts ran upsertProvidersFromRegistry.",
    );
    await AppDataSource.destroy();
    process.exit(1);
  }

  const legacyVendors = await vendorRepo
    .createQueryBuilder("v")
    .where("v.default_carrier = :c", { c: "postaplus" })
    .andWhere("v.default_shipping_account_id IS NULL")
    .getMany();

  console.log(`Found ${legacyVendors.length} vendors using legacy PostaPlus creds.`);

  const encrypted = encryption.encryptObject({ api_key: apiKey, account_number: accountNumber });
  const last4 = apiKey.slice(-4);

  for (const vendor of legacyVendors) {
    const existing = await accountRepo.findOne({
      where: { vendor_id: vendor.id, provider_id: provider.id },
    });
    if (existing) {
      console.log(`[skip] vendor ${vendor.id} already has a PostaPlus account`);
      continue;
    }
    const saved = await accountRepo.save({
      vendor_id: vendor.id,
      provider_id: provider.id,
      display_name: "PostaPlus (legacy shared credentials — please replace)",
      credentials_encrypted: encrypted,
      credentials_last4: last4,
      is_active: true,
      is_verified: true,
      verified_at: new Date(),
    });
    await vendorRepo.update(vendor.id, { default_shipping_account_id: saved.id });
    console.log(`[ok] backfilled vendor ${vendor.id} → account ${saved.id}`);
  }

  await AppDataSource.destroy();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
