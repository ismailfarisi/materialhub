import type { DataSource } from "typeorm";
import {
  ECO_ATTRIBUTES,
  ECO_ATTRIBUTE_CATEGORY_SLUGS,
  FOOD_SERVICE_CATEGORY,
  FOOD_SERVICE_CHILDREN,
  FOOD_SERVICE_PARENT_SLUG,
  PLASTIC_BAN_COLLECTION_SLUG,
} from "../eco/eco-catalogue.ts";
import { AttributeTranslation } from "../entities/attribute-translation.entity.ts";
import { AttributeValueTranslation } from "../entities/attribute-value-translation.entity.ts";
import { AttributeValue } from "../entities/attribute-value.entity.ts";
import { Attribute } from "../entities/attribute.entity.ts";
import { CategoryAttribute } from "../entities/category-attribute.entity.ts";
import { CategoryTranslation } from "../entities/category-translation.entity.ts";
import { Category } from "../entities/category.entity.ts";
import { Inventory } from "../entities/inventory.entity.ts";
import { ProductAttributeValue } from "../entities/product-attribute-value.entity.ts";
import { ProductCategory } from "../entities/product-category.entity.ts";
import { ProductCollection } from "../entities/product-collection.entity.ts";
import { ProductEcoDeclaration } from "../entities/product-eco-declaration.entity.ts";
import { ProductTranslation } from "../entities/product-translation.entity.ts";
import { Product } from "../entities/product.entity.ts";
import { User } from "../entities/user.entity.ts";
import { VendorMember } from "../entities/vendor-member.entity.ts";
import { Vendor } from "../entities/vendor.entity.ts";
import { Warehouse } from "../entities/warehouse.entity.ts";
import {
  type AttributeFilterInputType,
  type AttributeType,
  EcoDeclarationStatus,
  ProductCollectionKind,
  ProductCollectionSort,
  ProductStatus,
  VendorMemberRole,
  VendorMemberStatus,
  VendorStatus,
} from "../enums.ts";
import { UserRole, UserStatus } from "../enums/user.enums.ts";

/**
 * Eco catalogue seed (workstream 4). Idempotent: every step looks up by slug
 * first, so it is safe on databases seeded before this workstream existed.
 *
 *  1. Compliance attributes (+ Arabic) and their links to packaging categories.
 *  2. The food-service paper packaging subtree under Boxes & Packaging.
 *  3. A demo supplier with MaterialHub-branded food-service products, some
 *     with approved, one pending and some with no plastic-ban declaration.
 *  4. The rule collection behind the "Plastic-ban ready packaging" landing.
 */
export async function seedEcoCatalogue(ds: DataSource): Promise<void> {
  const attrIds = await seedAttributes(ds);
  await seedFoodServiceCategories(ds);
  await linkCategoryAttributes(ds, attrIds);
  await seedDemoProducts(ds);
  await seedCollection(ds);
}

type AttrIndex = Map<string, { id: string; values: Map<string, string> }>;

async function seedAttributes(ds: DataSource): Promise<AttrIndex> {
  const attrRepo = ds.getRepository(Attribute);
  const valueRepo = ds.getRepository(AttributeValue);
  const attrTrRepo = ds.getRepository(AttributeTranslation);
  const valueTrRepo = ds.getRepository(AttributeValueTranslation);
  const index: AttrIndex = new Map();
  let created = 0;

  for (const [i, def] of ECO_ATTRIBUTES.entries()) {
    let attr = await attrRepo.findOne({ where: { slug: def.slug } });
    if (!attr) {
      attr = await attrRepo.save(
        attrRepo.create({
          name: def.name,
          slug: def.slug,
          type: def.type as AttributeType,
          is_filterable: true,
          is_searchable: false,
          filter_input_type: def.filter_input_type as AttributeFilterInputType,
          sort_order: 50 + i,
          validation: def.validation ?? null,
        }),
      );
      await attrTrRepo.save(
        attrTrRepo.create({ attribute_id: attr.id, locale: "ar", name: def.ar }),
      );
      created += 1;
    }
    const values = new Map<string, string>();
    for (const [j, v] of def.values.entries()) {
      let row = await valueRepo.findOne({ where: { attribute_id: attr.id, slug: v.slug } });
      if (!row) {
        row = await valueRepo.save(
          valueRepo.create({ attribute_id: attr.id, value: v.value, slug: v.slug, sort_order: j }),
        );
        await valueTrRepo.save(
          valueTrRepo.create({
            attribute_value_id: row.id,
            locale: "ar",
            value: v.ar,
            display_value: v.ar,
          }),
        );
      }
      values.set(v.slug, row.id);
    }
    index.set(def.slug, { id: attr.id, values });
  }
  console.log(
    created
      ? `  ✓ Created ${created} eco compliance attributes`
      : "  – Eco compliance attributes already seeded, skipping",
  );
  return index;
}

async function seedFoodServiceCategories(ds: DataSource): Promise<void> {
  const catRepo = ds.getRepository(Category);
  const trRepo = ds.getRepository(CategoryTranslation);
  const parent = await catRepo.findOne({ where: { slug: FOOD_SERVICE_PARENT_SLUG } });
  if (!parent) {
    console.log("  – Boxes & Packaging missing; food-service subtree skipped");
    return;
  }
  let created = 0;
  const ensure = async (
    def: { slug: string; name: string; ar: string },
    parentCat: Category,
    sortOrder: number,
  ): Promise<Category> => {
    const existing = await catRepo.findOne({ where: { slug: def.slug } });
    if (existing) return existing;
    const cat = await catRepo.save(
      catRepo.create({
        name: def.name,
        slug: def.slug,
        parent_id: parentCat.id,
        sort_order: sortOrder,
        depth: parentCat.depth + 1,
        path: `${parentCat.path ?? parentCat.slug}/${def.slug}`,
      }),
    );
    await trRepo.save(trRepo.create({ category_id: cat.id, locale: "ar", name: def.ar }));
    created += 1;
    return cat;
  };
  const siblings = await catRepo.count({ where: { parent_id: parent.id } });
  const fs = await ensure(FOOD_SERVICE_CATEGORY, parent, siblings + 1);
  for (const [i, child] of FOOD_SERVICE_CHILDREN.entries()) await ensure(child, fs, i + 1);
  console.log(
    created
      ? `  ✓ Created ${created} food-service packaging categories`
      : "  – Food-service packaging categories already seeded, skipping",
  );
}

async function linkCategoryAttributes(ds: DataSource, attrs: AttrIndex): Promise<void> {
  const catRepo = ds.getRepository(Category);
  const linkRepo = ds.getRepository(CategoryAttribute);
  let created = 0;
  for (const slug of ECO_ATTRIBUTE_CATEGORY_SLUGS) {
    const cat = await catRepo.findOne({ where: { slug } });
    if (!cat) continue;
    for (const [i, def] of ECO_ATTRIBUTES.entries()) {
      if (def.onlyCategories && !def.onlyCategories.includes(slug)) continue;
      const attr = attrs.get(def.slug);
      if (!attr) continue;
      const exists = await linkRepo.findOne({
        where: { category_id: cat.id, attribute_id: attr.id },
      });
      if (exists) continue;
      await linkRepo.save(
        linkRepo.create({ category_id: cat.id, attribute_id: attr.id, sort_order: 50 + i }),
      );
      created += 1;
    }
  }
  console.log(`  ✓ Linked eco attributes to packaging categories (${created} new links)`);
}

interface DemoProduct {
  slug: string;
  name: string;
  ar: string;
  short: string;
  shortAr: string;
  category: string;
  price: number; // fils
  sku: string;
  attrs: Record<string, string[] | number>;
  declaration?: { status: EcoDeclarationStatus; statement: string };
}

const DEMO_VENDOR_SLUG = "materialhub-eco-supply";

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "kraft-paper-carry-bag-twisted-handle-32x12x41-pack-250",
    name: "Kraft paper carry bag, twisted handle, 32 × 12 × 41 cm — pack of 250",
    ar: "كيس ورق كرافت بمقبض مبروم، 32 × 12 × 41 سم — عبوة 250",
    short: "90 gsm brown kraft, flat base, glued twisted paper handles.",
    shortAr: "كرافت بني 90 غرام، قاعدة مسطحة، مقابض ورقية مبرومة ملصقة.",
    category: "food-service-paper-bags",
    price: 18750,
    sku: "MH-ECO-BAG-3241",
    attrs: {
      "material-composition": ["kraft-paper", "recycled-paper-fibre"],
      recyclable: ["yes"],
      compostable: ["home"],
      "plastic-free": ["yes"],
      "forest-certification": ["fsc"],
      "bag-thickness-microns": 110,
    },
    declaration: {
      status: EcoDeclarationStatus.approved,
      statement:
        "Paper bag, 90 gsm (about 110 microns), water-based glue, no plastic lining or film.",
    },
  },
  {
    slug: "single-wall-paper-cup-8oz-240ml-carton-1000",
    name: "Single-wall paper cup, 8 oz (240 ml), water-based coating — carton of 1,000",
    ar: "كوب ورقي بجدار واحد، 8 أونصة (240 مل)، طلاء مائي — كرتونة 1000",
    short: "280 gsm cupstock, 80 mm rim, aqueous barrier instead of PE lining.",
    shortAr: "كرتون أكواب 280 غرام، حافة 80 مم، حاجز مائي بدلاً من بطانة PE.",
    category: "paper-cups-lids",
    price: 32000,
    sku: "MH-ECO-CUP-08",
    attrs: {
      "material-composition": ["paperboard", "water-based-coating"],
      recyclable: ["yes"],
      compostable: ["industrial"],
      "plastic-free": ["yes"],
      "forest-certification": ["pefc"],
    },
    declaration: {
      status: EcoDeclarationStatus.approved,
      statement: "Paperboard cup with a water-based dispersion barrier; no PE or PLA lining.",
    },
  },
  {
    slug: "paperboard-sip-lid-80mm-carton-1000",
    name: "Paperboard sip lid for 80 mm cups — carton of 1,000",
    ar: "غطاء ارتشاف من الكرتون الورقي لأكواب 80 مم — كرتونة 1000",
    short: "Moulded paperboard lid with sip opening; fits 8 oz and 12 oz cups.",
    shortAr: "غطاء من الكرتون المقولب بفتحة ارتشاف؛ يناسب أكواب 8 و12 أونصة.",
    category: "paper-cups-lids",
    price: 41000,
    sku: "MH-ECO-LID-80",
    attrs: {
      "material-composition": ["paperboard"],
      recyclable: ["yes"],
      compostable: ["industrial"],
      "plastic-free": ["yes"],
      "forest-certification": ["fsc"],
    },
    declaration: {
      status: EcoDeclarationStatus.pending,
      statement: "Fibre-only lid, no plastic. Compostability certificate attached on request.",
    },
  },
  {
    slug: "bagasse-clamshell-container-9x9in-carton-200",
    name: "Bagasse clamshell container, 9 × 9 in — carton of 200",
    ar: "علبة صدفية من تفل قصب السكر، 9 × 9 بوصة — كرتونة 200",
    short: "Moulded sugarcane fibre, hinged lid, oil and water resistant, microwave safe.",
    shortAr: "ألياف قصب سكر مقولبة، غطاء مفصلي، مقاومة للزيت والماء، آمنة للميكروويف.",
    category: "moulded-fibre-containers",
    price: 15000,
    sku: "MH-ECO-CLM-99",
    attrs: {
      "material-composition": ["moulded-fibre-bagasse"],
      recyclable: ["no"],
      compostable: ["home", "industrial"],
      "plastic-free": ["yes"],
      "forest-certification": ["not-certified"],
    },
    declaration: {
      status: EcoDeclarationStatus.approved,
      statement: "Moulded bagasse fibre, replaces foam clamshells. No plastic film or lining.",
    },
  },
  {
    slug: "birch-wood-cutlery-set-fork-knife-spoon-pack-500",
    name: "Birch wood cutlery set (fork, knife, spoon) — pack of 500 sets",
    ar: "طقم أدوات مائدة من خشب البتولا (شوكة، سكين، ملعقة) — عبوة 500 طقم",
    short: "160 mm birch wood, uncoated, each set in a kraft paper sleeve.",
    shortAr: "خشب بتولا 160 مم بدون طلاء، كل طقم في غلاف من ورق الكرافت.",
    category: "wooden-paper-cutlery",
    price: 27500,
    sku: "MH-ECO-CUT-500",
    attrs: {
      "material-composition": ["wood", "kraft-paper"],
      recyclable: ["no"],
      compostable: ["home", "industrial"],
      "plastic-free": ["yes"],
      "forest-certification": ["fsc"],
    },
    declaration: {
      status: EcoDeclarationStatus.approved,
      statement: "Solid birch wood cutlery in a paper sleeve. No plastic parts or wrap.",
    },
  },
  {
    slug: "pla-lined-paper-soup-cup-12oz-carton-500",
    name: "PLA-lined paper soup cup, 12 oz (350 ml) — carton of 500",
    ar: "كوب شوربة ورقي ببطانة PLA، 12 أونصة (350 مل) — كرتونة 500",
    short: "Double-wall paperboard with a plant-based PLA lining; lid sold separately.",
    shortAr: "كرتون ورقي مزدوج الجدار ببطانة PLA نباتية؛ الغطاء يباع منفصلاً.",
    category: "paper-cups-lids",
    price: 22500,
    sku: "MH-ECO-SOUP-12",
    attrs: {
      "material-composition": ["paperboard", "pla-lining"],
      recyclable: ["no"],
      compostable: ["industrial"],
      "plastic-free": ["no"],
      "forest-certification": ["not-certified"],
    },
  },
  {
    slug: "kraft-mailer-box-e-flute-250x180x80-pack-50",
    name: "Kraft mailer box, E-flute, 250 × 180 × 80 mm — pack of 50",
    ar: "صندوق شحن كرافت، تموج E، ‏250 × 180 × 80 مم — عبوة 50",
    short: "Self-locking tuck-front mailer in brown kraft corrugated board.",
    shortAr: "صندوق شحن ذاتي القفل من الكرتون المموج الكرافت البني.",
    category: "mailer-boxes",
    price: 9500,
    sku: "MH-ECO-MLR-25",
    attrs: {
      "material-composition": ["kraft-paper", "recycled-paper-fibre"],
      recyclable: ["yes"],
      "plastic-free": ["yes"],
      "forest-certification": ["fsc"],
    },
  },
];

async function seedDemoProducts(ds: DataSource): Promise<void> {
  const productRepo = ds.getRepository(Product);
  if (await productRepo.findOne({ where: { slug: DEMO_PRODUCTS[0]!.slug }, withDeleted: true })) {
    console.log("  – Eco demo products already seeded, skipping");
    return;
  }

  const vendor = await ensureDemoVendor(ds);
  const warehouseRepo = ds.getRepository(Warehouse);
  let warehouse = await warehouseRepo.findOne({
    where: { vendor_id: vendor.id, is_default: true },
  });
  if (!warehouse) {
    warehouse = await warehouseRepo.save(
      warehouseRepo.create({
        vendor_id: vendor.id,
        name: "MaterialHub Eco Supply, Dubai",
        code: "MH-ECO-DXB",
        address_line_1: "Demo warehouse — not a real address",
        address_line_2: null,
        city: "Dubai",
        emirate: "Dubai",
        country_code: "AE",
        is_active: true,
        is_default: true,
      }),
    );
  }

  const attrRepo = ds.getRepository(Attribute);
  const attrs = await attrRepo.find({ relations: ["values"] });
  const bySlug = new Map(attrs.map((a) => [a.slug, a]));
  const admin = await ds
    .getRepository(User)
    .findOne({ where: { email: "admin@materialhubuae.com" } });
  const catRepo = ds.getRepository(Category);

  for (const def of DEMO_PRODUCTS) {
    const cat = await catRepo.findOne({ where: { slug: def.category } });
    if (!cat) continue;
    await ds.transaction(async (m) => {
      const product = await m.save(
        Product,
        m.create(Product, {
          vendor_id: vendor.id,
          category_id: cat.id,
          name: def.name,
          slug: def.slug,
          short_description: def.short,
          description: def.short,
          price: def.price,
          currency: "AED",
          sku: def.sku,
          status: ProductStatus.published,
          published_at: new Date(),
          requires_shipping: true,
          track_inventory: true,
          country_of_origin: "AE",
          tags: ["food-service", "packaging"],
        }),
      );
      await m.save(
        ProductCategory,
        m.create(ProductCategory, {
          product_id: product.id,
          category_id: cat.id,
          is_primary: true,
        }),
      );
      await m.save(
        ProductTranslation,
        m.create(ProductTranslation, {
          product_id: product.id,
          locale: "ar",
          name: def.ar,
          short_description: def.shortAr,
          description: def.shortAr,
        }),
      );
      for (const [slug, val] of Object.entries(def.attrs)) {
        const attr = bySlug.get(slug);
        if (!attr) continue;
        if (typeof val === "number") {
          await m.save(
            ProductAttributeValue,
            m.create(ProductAttributeValue, {
              product_id: product.id,
              attribute_id: attr.id,
              text_value: String(val),
            }),
          );
          continue;
        }
        for (const valueSlug of val) {
          const value = attr.values.find((v) => v.slug === valueSlug);
          if (!value) continue;
          await m.save(
            ProductAttributeValue,
            m.create(ProductAttributeValue, {
              product_id: product.id,
              attribute_id: attr.id,
              attribute_value_id: value.id,
            }),
          );
        }
      }
      await m.save(
        Inventory,
        m.create(Inventory, {
          product_id: product.id,
          vendor_id: vendor.id,
          warehouse_id: warehouse.id,
          quantity_on_hand: 40,
          quantity_reserved: 0,
          quantity_available: 40,
          low_stock_threshold: 5,
        }),
      );
      if (def.declaration) {
        const reviewed = def.declaration.status !== EcoDeclarationStatus.pending;
        await m.save(
          ProductEcoDeclaration,
          m.create(ProductEcoDeclaration, {
            product_id: product.id,
            vendor_id: vendor.id,
            status: def.declaration.status,
            statement: def.declaration.statement,
            submitted_at: new Date(),
            reviewed_by: reviewed ? (admin?.id ?? null) : null,
            reviewed_at: reviewed ? new Date() : null,
          }),
        );
      }
    });
  }
  console.log(`  ✓ Created ${DEMO_PRODUCTS.length} eco demo products (MaterialHub Eco Supply)`);
}

async function ensureDemoVendor(ds: DataSource): Promise<Vendor> {
  const vendorRepo = ds.getRepository(Vendor);
  const existing = await vendorRepo.findOne({ where: { slug: DEMO_VENDOR_SLUG } });
  if (existing) return existing;

  const userRepo = ds.getRepository(User);
  const email = "eco-supply@materialhubuae.com";
  let owner = await userRepo.findOne({ where: { email } });
  if (!owner) {
    const password = process.env.SEED_VENDOR_PASSWORD || "Vendor@123";
    owner = await userRepo.save(
      userRepo.create({
        first_name: "Eco",
        last_name: "Supplier",
        email,
        password_hash: await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 }),
        role: UserRole.customer,
        status: UserStatus.active,
        email_verified_at: new Date(),
        preferred_locale: "en",
        preferred_currency: "AED",
      }),
    );
  }
  const vendor = await vendorRepo.save(
    vendorRepo.create({
      name: "MaterialHub Eco Supply",
      slug: DEMO_VENDOR_SLUG,
      description: "Demo supplier of paper and moulded-fibre food-service packaging.",
      status: VendorStatus.approved,
      verified_at: new Date(),
      business_name: "MaterialHub Eco Supply (demo)",
      business_type: "trading",
      contact_email: email,
      contact_phone: "+971500000000",
    }),
  );
  await ds.getRepository(VendorMember).save(
    ds.getRepository(VendorMember).create({
      vendor_id: vendor.id,
      user_id: owner.id,
      email,
      role: VendorMemberRole.owner,
      status: VendorMemberStatus.active,
      accepted_at: new Date(),
    }),
  );
  return vendor;
}

async function seedCollection(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(ProductCollection);
  if (await repo.findOne({ where: { slug: PLASTIC_BAN_COLLECTION_SLUG } })) {
    console.log("  – Plastic-ban ready collection already seeded, skipping");
    return;
  }
  await repo.save(
    repo.create({
      name: "Plastic-ban ready packaging",
      slug: PLASTIC_BAN_COLLECTION_SLUG,
      description:
        "Paper, moulded-fibre and wooden packaging whose suppliers declared it plastic-ban ready. MaterialHub reviewed each declaration; it is not a legal certification.",
      kind: ProductCollectionKind.product,
      rules: { v: 1, match: "all", conditions: { plastic_ban_ready: true } },
      default_sort: ProductCollectionSort.newest,
      is_active: true,
    }),
  );
  console.log("  ✓ Created rule collection: plastic-ban-ready-packaging");
}
