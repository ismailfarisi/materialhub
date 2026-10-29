/**
 * Bulk index products into Typesense by fetching from admin API and upserting directly.
 * Run: node scripts/bulk-index-typesense.mjs
 */
const API = "http://127.0.0.1:3000";
const TYPESENSE = "http://127.0.0.1:8108";
const TS_KEY = "dev-typesense-key";

async function main() {
  // Login
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@materialhubuae.com", password: "Admin@123" }),
  });
  const token = (await loginRes.json()).data.tokens.accessToken;

  // Get all products with images
  const listRes = await fetch(`${API}/admin/products?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const items = (await listRes.json()).data.items;
  console.log(`Found ${items.length} products`);

  let indexed = 0;
  for (const p of items) {
    if (p.status !== "published") {
      console.log(`  SKIP ${p.name} (status: ${p.status})`);
      continue;
    }

    const images = (p.images || []).map(i => i.url).filter(Boolean);
    const doc = {
      id: p.id,
      name: p.name || "",
      description: p.description || "",
      category_name: p.category?.name || p.category_name || "Beauty & Health",
      category_id: p.category_id || "",
      brand_name: p.brand?.name || p.brand_name || "",
      brand_id: p.brand_id || "",
      vendor_name: p.vendor?.store_name || p.vendor_name || "MaterialHub",
      vendor_id: p.vendor_id || "",
      price_min: p.price || 0,
      price_max: p.price || 0,
      compare_at_price: p.compare_at_price || 0,
      tags: p.tags || [],
      rating_avg: parseFloat(p.rating_avg) || 0.0,
      in_stock: true,
      attributes: [],
      slug: p.slug || "",
      images: images,
      status: p.status,
      created_at: Math.floor(new Date(p.created_at).getTime() / 1000),
    };

    const res = await fetch(`${TYPESENSE}/collections/products/documents?action=upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-TYPESENSE-API-KEY": TS_KEY },
      body: JSON.stringify(doc),
    });
    const result = await res.json();
    if (result.id) {
      indexed++;
      console.log(`  OK [${indexed}] ${p.name}`);
    } else {
      console.log(`  FAIL ${p.name}: ${JSON.stringify(result)}`);
    }
  }

  console.log(`\nIndexed ${indexed} products`);

  // Verify search
  const searchRes = await fetch(`${API}/products?limit=5`);
  const searchData = await searchRes.json();
  const results = searchData.data?.data || searchData.data || [];
  console.log(`Public search returns ${results.length} products`);
  if (results.length) results.slice(0, 5).forEach(p => console.log(`  - ${p.name} | images: ${(p.images || []).length}`));
}

main().catch(console.error);
