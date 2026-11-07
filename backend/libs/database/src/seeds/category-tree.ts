import type { DataSource } from "typeorm";
import { CategoryTranslation } from "../entities/category-translation.entity.ts";
import { Category } from "../entities/category.entity.ts";

/** One seeded category: English name (the base row), slug and Arabic name. */
export type SeedCategoryName = { name: string; slug: string; ar: string };

export type SeedCategory = SeedCategoryName & {
  featured?: boolean;
  children: SeedCategoryName[];
};

/**
 * The storefront category tree, in seed order (PRODUCT.md: papers & boards,
 * leather & fabrics, hardware & fittings, adhesives & finishing, boxes &
 * packaging, ribbons & trims, decoration & craft). Arabic top-level names match
 * `content.categories` in the storefront's ar.json. The food-service subtree
 * under Boxes & Packaging lives in the eco catalogue and carries its own Arabic.
 */
export const CATEGORY_TREE: SeedCategory[] = [
  {
    name: "Papers & Boards",
    slug: "papers-boards",
    ar: "ورق وألواح",
    featured: true,
    children: [
      { name: "Art Papers", slug: "art-papers", ar: "ورق فني" },
      { name: "Kraft Papers", slug: "kraft-papers", ar: "ورق كرافت" },
      { name: "Speciality & Textured Papers", slug: "speciality-papers", ar: "ورق خاص وورق بملمس" },
      {
        name: "Greyboard & Chipboard",
        slug: "greyboard-chipboard",
        ar: "كرتون رمادي وكرتون مضغوط",
      },
      { name: "Corrugated Boards", slug: "corrugated-boards", ar: "كرتون مموّج" },
      { name: "Paper Sample Books", slug: "paper-sample-books", ar: "كتب عيّنات الورق" },
    ],
  },
  {
    name: "Leather & Fabrics",
    slug: "leather-fabrics",
    ar: "جلود وأقمشة",
    featured: true,
    children: [
      { name: "PU Leather", slug: "pu-leather", ar: "جلد صناعي PU" },
      { name: "Bonded Leather", slug: "bonded-leather", ar: "جلد معاد التصنيع" },
      { name: "Linen & Book Cloth", slug: "linen-book-cloth", ar: "كتان وقماش تجليد" },
      { name: "Velvet & Suede", slug: "velvet-suede", ar: "مخمل وشامواه" },
    ],
  },
  {
    name: "Hardware & Fittings",
    slug: "hardware-fittings",
    ar: "إكسسوارات معدنية وتركيبات",
    featured: true,
    children: [
      { name: "Hinges", slug: "hinges", ar: "مفصلات" },
      { name: "Magnets & Closures", slug: "magnets-closures", ar: "مغناطيس وأدوات إغلاق" },
      { name: "Handles & Corners", slug: "handles-corners", ar: "مقابض وزوايا" },
      {
        name: "Rivets, Eyelets & Studs",
        slug: "rivets-eyelets-studs",
        ar: "براشيم وحلقات معدنية وكبسات",
      },
    ],
  },
  {
    name: "Adhesives & Finishing",
    slug: "adhesives-finishing",
    ar: "مواد لاصقة وتشطيب",
    featured: true,
    children: [
      { name: "Glues & Adhesives", slug: "glues-adhesives", ar: "غراء ومواد لاصقة" },
      { name: "Double-sided Tapes", slug: "double-sided-tapes", ar: "أشرطة لاصقة على الوجهين" },
      { name: "Foils & Laminates", slug: "foils-laminates", ar: "رقائق الفويل وأفلام التصفيح" },
      { name: "Inks & Coatings", slug: "inks-coatings", ar: "أحبار وطلاءات" },
    ],
  },
  {
    name: "Boxes & Packaging",
    slug: "boxes-packaging",
    ar: "صناديق وتغليف",
    featured: true,
    children: [
      { name: "Rigid Boxes", slug: "rigid-boxes", ar: "علب صلبة" },
      { name: "Folding Cartons", slug: "folding-cartons", ar: "علب كرتونية قابلة للطي" },
      { name: "Mailer Boxes", slug: "mailer-boxes", ar: "صناديق شحن" },
      { name: "Paper Bags", slug: "paper-bags", ar: "أكياس ورقية" },
      { name: "Inserts & Fillers", slug: "inserts-fillers", ar: "حشوات داخلية ومواد حشو" },
    ],
  },
  {
    name: "Ribbons & Trims",
    slug: "ribbons-trims",
    ar: "شرائط وزخارف",
    children: [
      {
        name: "Satin & Grosgrain Ribbons",
        slug: "satin-grosgrain-ribbons",
        ar: "شرائط ساتان وغروغران",
      },
      { name: "Cords & Elastics", slug: "cords-elastics", ar: "حبال وأشرطة مطاطية" },
      { name: "Tags & Labels", slug: "tags-labels", ar: "بطاقات وملصقات" },
    ],
  },
  {
    name: "Decoration & Craft",
    slug: "decoration-craft",
    ar: "ديكور وحِرف",
    featured: true,
    children: [
      {
        name: "Paper Samples & Swatches",
        slug: "paper-samples-swatches",
        ar: "عيّنات ونماذج الورق",
      },
      { name: "Decorative Papers", slug: "decorative-papers", ar: "ورق مزخرف" },
      { name: "Party & Event Decor", slug: "party-event-decor", ar: "زينة الحفلات والمناسبات" },
      { name: "Craft Kits", slug: "craft-kits", ar: "أطقم حِرف يدوية" },
      { name: "Stationery", slug: "stationery", ar: "قرطاسية" },
    ],
  },
];

/**
 * Add the Arabic name for every category in `CATEGORY_TREE` that has none.
 * Idempotent and safe on databases seeded before translations existed: it only
 * inserts missing (category, "ar") rows and never overwrites a translation an
 * admin has edited. Categories the tree names but the database lacks are skipped.
 */
export async function seedCategoryTranslations(ds: DataSource): Promise<void> {
  const catRepo = ds.getRepository(Category);
  const trRepo = ds.getRepository(CategoryTranslation);
  const names = CATEGORY_TREE.flatMap((top) => [top, ...top.children]);

  const cats = await catRepo.find({ select: { id: true, slug: true } });
  const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const translated = new Set(
    (
      await trRepo.find({
        where: { locale: "ar" },
        withDeleted: true,
        select: { category_id: true },
      })
    ).map((t) => t.category_id),
  );

  const missing = names
    .map((n) => ({ id: idBySlug.get(n.slug), ar: n.ar }))
    .filter((n): n is { id: string; ar: string } => !!n.id && !translated.has(n.id));

  if (missing.length === 0) {
    console.log("  – Category Arabic names already seeded, skipping");
    return;
  }
  await trRepo
    .createQueryBuilder()
    .insert()
    .values(missing.map((n) => ({ category_id: n.id, locale: "ar", name: n.ar })))
    .orIgnore()
    .execute();
  console.log(`  ✓ Added Arabic names for ${missing.length} categories`);
}
