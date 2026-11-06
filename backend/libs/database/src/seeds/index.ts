import "reflect-metadata";
import { IsNull } from "typeorm";
import { AppDataSource } from "../data-source.ts";
import { Category } from "../entities/category.entity.ts";
import { PaymentMethodThreshold } from "../entities/payment-method-threshold.entity.ts";
import { SiteSetting } from "../entities/site-setting.entity.ts";
import { TaxRate } from "../entities/tax-rate.entity.ts";
import { User } from "../entities/user.entity.ts";
import { Warehouse } from "../entities/warehouse.entity.ts";
import { UserRole, UserStatus } from "../enums/user.enums.ts";
import { seedEcoCatalogue } from "./eco-catalogue.seed.ts";

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
    type SeedCat = {
      name: string;
      slug: string;
      featured?: boolean;
      children: Array<[string, string]>;
    };
    const tree: SeedCat[] = [
      {
        name: "Papers & Boards",
        slug: "papers-boards",
        featured: true,
        children: [
          ["Art Papers", "art-papers"],
          ["Kraft Papers", "kraft-papers"],
          ["Speciality & Textured Papers", "speciality-papers"],
          ["Greyboard & Chipboard", "greyboard-chipboard"],
          ["Corrugated Boards", "corrugated-boards"],
          ["Paper Sample Books", "paper-sample-books"],
        ],
      },
      {
        name: "Leather & Fabrics",
        slug: "leather-fabrics",
        featured: true,
        children: [
          ["PU Leather", "pu-leather"],
          ["Bonded Leather", "bonded-leather"],
          ["Linen & Book Cloth", "linen-book-cloth"],
          ["Velvet & Suede", "velvet-suede"],
        ],
      },
      {
        name: "Hardware & Fittings",
        slug: "hardware-fittings",
        featured: true,
        children: [
          ["Hinges", "hinges"],
          ["Magnets & Closures", "magnets-closures"],
          ["Handles & Corners", "handles-corners"],
          ["Rivets, Eyelets & Studs", "rivets-eyelets-studs"],
        ],
      },
      {
        name: "Adhesives & Finishing",
        slug: "adhesives-finishing",
        featured: true,
        children: [
          ["Glues & Adhesives", "glues-adhesives"],
          ["Double-sided Tapes", "double-sided-tapes"],
          ["Foils & Laminates", "foils-laminates"],
          ["Inks & Coatings", "inks-coatings"],
        ],
      },
      {
        name: "Boxes & Packaging",
        slug: "boxes-packaging",
        featured: true,
        children: [
          ["Rigid Boxes", "rigid-boxes"],
          ["Folding Cartons", "folding-cartons"],
          ["Mailer Boxes", "mailer-boxes"],
          ["Paper Bags", "paper-bags"],
          ["Inserts & Fillers", "inserts-fillers"],
        ],
      },
      {
        name: "Ribbons & Trims",
        slug: "ribbons-trims",
        children: [
          ["Satin & Grosgrain Ribbons", "satin-grosgrain-ribbons"],
          ["Cords & Elastics", "cords-elastics"],
          ["Tags & Labels", "tags-labels"],
        ],
      },
      {
        name: "Decoration & Craft",
        slug: "decoration-craft",
        featured: true,
        children: [
          ["Paper Samples & Swatches", "paper-samples-swatches"],
          ["Decorative Papers", "decorative-papers"],
          ["Party & Event Decor", "party-event-decor"],
          ["Craft Kits", "craft-kits"],
          ["Stationery", "stationery"],
        ],
      },
    ];
    let created = 0;
    for (const [i, top] of tree.entries()) {
      const parent = await catRepo.save(
        catRepo.create({
          name: top.name,
          slug: top.slug,
          sort_order: i + 1,
          is_featured: top.featured ?? false,
          depth: 0,
          path: top.slug,
        }),
      );
      created += 1;
      await catRepo.save(
        top.children.map(([name, slug], j) =>
          catRepo.create({
            name,
            slug,
            parent_id: parent.id,
            sort_order: j + 1,
            depth: 1,
            path: `${top.slug}/${slug}`,
          }),
        ),
      );
      created += top.children.length;
    }
    console.log(`  ✓ Created ${created} categories (${tree.length} top-level)`);
  } else {
    console.log("  – Categories already seeded, skipping");
  }

  // ── BNPL payment thresholds (checkout quote rules) ──────────────
  const thresholdRepo = ds.getRepository(PaymentMethodThreshold);
  const thresholdCount = await thresholdRepo.count();
  if (thresholdCount === 0) {
    await thresholdRepo.save([
      thresholdRepo.create({
        provider: "tabby",
        min_amount_fils: 10000,
        max_amount_fils: 500000,
        plans: [
          { installments: 4, interval_days: 30 },
          { installments: 3, interval_days: 30 },
        ],
        is_active: true,
      }),
      thresholdRepo.create({
        provider: "tamara",
        min_amount_fils: 5000,
        max_amount_fils: 300000,
        plans: [{ installments: 3, interval_days: 30 }],
        is_active: true,
      }),
    ]);
    console.log("  ✓ Created BNPL thresholds (Tabby, Tamara)");
  } else {
    console.log("  – BNPL thresholds already seeded, skipping");
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
        value: "Packaging materials and craft supplies for the UAE",
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

  // ── Default platform hub warehouse ──────────────────────────────
  // The platform hub (vendor_id IS NULL, is_default TRUE) receives
  // consolidated shipments and sample packs. This seed ensures exactly one
  // default platform hub exists. Ops MUST update the address
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

  // ── Eco catalogue: compliance attributes, food-service packaging ─
  await seedEcoCatalogue(ds);

  await ds.destroy();
  console.log("Seeding complete.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
