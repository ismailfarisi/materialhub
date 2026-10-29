/**
 * Trigger reindex for all products by toggling is_featured via admin API.
 * Run: node scripts/reindex-products.mjs
 */
const API = "http://127.0.0.1:3000";

async function main() {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@materialhubuae.com", password: "Admin@123" }),
  });
  const token = (await loginRes.json()).data.tokens.accessToken;

  // Get all products
  const listRes = await fetch(`${API}/admin/products?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const items = (await listRes.json()).data.items;
  console.log(`Found ${items.length} products, triggering reindex...`);

  for (const item of items) {
    // Touch the product to trigger reindex
    const res = await fetch(`${API}/admin/products/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_featured: true }),
    });
    const data = await res.json();
    console.log(`  [${data.statusCode}] ${item.name}`);
  }

  console.log("Done. Waiting 2s for Typesense to sync...");
  await new Promise(r => setTimeout(r, 2000));

  // Verify
  const searchRes = await fetch(`${API}/products?limit=5`);
  const searchData = await searchRes.json();
  const results = searchData.data?.data || searchData.data || [];
  console.log(`\nPublic search returns ${results.length} products`);
  if (results.length) results.forEach(p => console.log(`  - ${p.name}`));
}

main().catch(console.error);
