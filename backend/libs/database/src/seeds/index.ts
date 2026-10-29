import "reflect-metadata";
import { IsNull } from "typeorm";
import { AppDataSource } from "../data-source.ts";
import { Category } from "../entities/category.entity.ts";
import { SiteSetting } from "../entities/site-setting.entity.ts";
import { TaxRate } from "../entities/tax-rate.entity.ts";
import { User } from "../entities/user.entity.ts";
import { Warehouse } from "../entities/warehouse.entity.ts";
import { UserRole, UserStatus } from "../enums/user.enums.ts";

async function seed() {
  const ds = await AppDataSource.initialize();
  console.log("Database connected — seeding...");

  // ── Admin & test users ──────────────────────────────────────────
  const userRepo = ds.getRepository(User);

  const adminExists = await userRepo.findOne({ where: { email: "admin@materialhubuae.com" } });
  if (!adminExists) {
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin@123";
    const customerPassword = process.env.SEED_CUSTOMER_PASSWORD || "Customer@123";
    const adminHash = await Bun.password.hash(adminPassword, { algorithm: "bcrypt", cost: 10 });
    const customerHash = await Bun.password.hash(customerPassword, {
      algorithm: "bcrypt",
      cost: 10,
    });
    await userRepo.save([
      userRepo.create({
        first_name: "Super",
        last_name: "Admin",
        email: "admin@materialhubuae.com",
        password_hash: adminHash,
        role: UserRole.super_admin,
        status: UserStatus.active,
        email_verified_at: new Date(),
        preferred_locale: "en",
        preferred_currency: "AED",
      }),
      userRepo.create({
        first_name: "Test",
        last_name: "Customer",
        email: "customer@materialhubuae.com",
        password_hash: customerHash,
        role: UserRole.customer,
        status: UserStatus.active,
        email_verified_at: new Date(),
        preferred_locale: "en",
        preferred_currency: "AED",
      }),
    ]);
    console.log("  ✓ Created admin + test customer");
  } else {
    console.log("  – Users already seeded, skipping");
  }

  // ── Categories ──────────────────────────────────────────────────
  const catRepo = ds.getRepository(Category);
  const catCount = await catRepo.count();
  if (catCount === 0) {
    const topCategories = await catRepo.save([
      catRepo.create({
        name: "Electronics",
        slug: "electronics",
        sort_order: 1,
        is_featured: true,
        depth: 0,
        path: "electronics",
      }),
      catRepo.create({
        name: "Fashion",
        slug: "fashion",
        sort_order: 2,
        is_featured: true,
        depth: 0,
        path: "fashion",
      }),
      catRepo.create({
        name: "Home & Garden",
        slug: "home-garden",
        sort_order: 3,
        is_featured: true,
        depth: 0,
        path: "home-garden",
      }),
      catRepo.create({
        name: "Beauty & Health",
        slug: "beauty-health",
        sort_order: 4,
        is_featured: true,
        depth: 0,
        path: "beauty-health",
      }),
      catRepo.create({
        name: "Sports & Outdoors",
        slug: "sports-outdoors",
        sort_order: 5,
        is_featured: false,
        depth: 0,
        path: "sports-outdoors",
      }),
    ]);

    // Subcategories for Electronics
    const electronics = topCategories[0]!;
    await catRepo.save([
      catRepo.create({
        name: "Smartphones",
        slug: "smartphones",
        parent_id: electronics.id,
        sort_order: 1,
        depth: 1,
        path: "electronics/smartphones",
      }),
      catRepo.create({
        name: "Laptops",
        slug: "laptops",
        parent_id: electronics.id,
        sort_order: 2,
        depth: 1,
        path: "electronics/laptops",
      }),
      catRepo.create({
        name: "Audio",
        slug: "audio",
        parent_id: electronics.id,
        sort_order: 3,
        depth: 1,
        path: "electronics/audio",
      }),
    ]);

    // Subcategories for Fashion
    const fashion = topCategories[1]!;
    await catRepo.save([
      catRepo.create({
        name: "Men",
        slug: "mens-fashion",
        parent_id: fashion.id,
        sort_order: 1,
        depth: 1,
        path: "fashion/mens-fashion",
      }),
      catRepo.create({
        name: "Women",
        slug: "womens-fashion",
        parent_id: fashion.id,
        sort_order: 2,
        depth: 1,
        path: "fashion/womens-fashion",
      }),
    ]);
    console.log("  ✓ Created 10 categories (5 top-level + 5 subcategories)");
  } else {
    console.log("  – Categories already seeded, skipping");
  }

  // ── Tax rates (UAE VAT) ─────────────────────────────────────────
  const taxRepo = ds.getRepository(TaxRate);
  const taxCount = await taxRepo.count();
  if (taxCount === 0) {
    await taxRepo.save([
      taxRepo.create({
        name: "UAE Standard VAT",
        rate: 5.0,
        country_code: "AE",
        is_default: true,
        effective_from: "2018-01-01",
        is_active: true,
      }),
      taxRepo.create({
        name: "UAE Zero-Rated",
        rate: 0.0,
        country_code: "AE",
        is_default: false,
        effective_from: "2018-01-01",
        is_active: true,
      }),
    ]);
    console.log("  ✓ Created tax rates (UAE VAT 5% + zero-rated)");
  } else {
    console.log("  – Tax rates already seeded, skipping");
  }

  // ── Site settings ───────────────────────────────────────────────
  const settingRepo = ds.getRepository(SiteSetting);
  const settingCount = await settingRepo.count();
  if (settingCount === 0) {
    await settingRepo.save([
      settingRepo.create({
        key: "site_name",
        value: "MaterialHub",
        value_type: "string",
        group: "general",
        description: "Marketplace name",
      }),
      settingRepo.create({
        key: "site_tagline",
        value: "UAE's Funkiest Marketplace",
        value_type: "string",
        group: "general",
        description: "Tagline shown in header",
      }),
      settingRepo.create({
        key: "default_currency",
        value: "AED",
        value_type: "string",
        group: "general",
        description: "Default currency code",
      }),
      settingRepo.create({
        key: "default_locale",
        value: "en",
        value_type: "string",
        group: "general",
        description: "Default locale",
      }),
      settingRepo.create({
        key: "supported_locales",
        value: '["en","ar","hi","ur","ml"]',
        value_type: "json",
        group: "general",
        description: "Supported locale codes",
      }),
      settingRepo.create({
        key: "supported_currencies",
        value: '["AED","USD","EUR","GBP","SAR"]',
        value_type: "json",
        group: "general",
        description: "Supported currency codes",
      }),
      settingRepo.create({
        key: "vendor_commission_default",
        value: "10.00",
        value_type: "number",
        group: "vendor",
        description: "Default vendor commission percentage",
      }),
      settingRepo.create({
        key: "vendor_auto_approve",
        value: "false",
        value_type: "boolean",
        group: "vendor",
        description: "Auto-approve new vendor applications",
      }),
      settingRepo.create({
        key: "order_prefix",
        value: "FS",
        value_type: "string",
        group: "order",
        description: "Order number prefix",
      }),
      settingRepo.create({
        key: "max_cart_items",
        value: "50",
        value_type: "number",
        group: "cart",
        description: "Maximum items per cart",
      }),
      settingRepo.create({
        key: "cart_ttl_days",
        value: "30",
        value_type: "number",
        group: "cart",
        description: "Cart expiry in days",
      }),
      settingRepo.create({
        key: "vat_rate",
        value: "5.00",
        value_type: "number",
        group: "tax",
        description: "UAE standard VAT rate",
      }),
      settingRepo.create({
        key: "min_order_amount",
        value: "10.00",
        value_type: "number",
        group: "order",
        description: "Minimum order amount in AED",
      }),
    ]);
    console.log("  ✓ Created 13 site settings");
  } else {
    console.log("  – Site settings already seeded, skipping");
  }

  // ── Default platform hub warehouse (gift fulfillment) ──────────
  // gift_orders.hub_warehouse_id references the platform hub
  // (vendor_id IS NULL, is_default TRUE). Without it, hub_warehouse_id
  // is stored as null and gift assembly cannot proceed. This seed ensures
  // exactly one default platform hub exists. Ops MUST update the address
  // fields via the admin panel before going live.
  const warehouseRepo = ds.getRepository(Warehouse);
  const hubExists = await warehouseRepo.findOne({
    where: { vendor_id: IsNull(), is_default: true },
  });
  if (!hubExists) {
    await warehouseRepo.save(
      warehouseRepo.create({
        vendor_id: null,
        name: "MaterialHub Fulfillment Hub",
        code: "HUB-DEFAULT",
        address_line_1: "TBD - set in admin before going live",
        address_line_2: null,
        city: "Dubai",
        emirate: "Dubai",
        country_code: "AE",
        is_active: true,
        is_default: true,
      }),
    );
    console.log(
      "  ✓ Created default platform hub warehouse (HUB-DEFAULT) — update address in admin",
    );
  } else {
    console.log("  – Default platform hub warehouse already exists, skipping");
  }

  await ds.destroy();
  console.log("Seeding complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
