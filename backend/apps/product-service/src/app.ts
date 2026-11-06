import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { bulkRoutes } from "./bulk/index.ts";
import { adminProductRoutes } from "./routes/admin-product.routes.ts";
import { aiSettingsRoutes } from "./routes/ai-settings.routes.ts";
import { attributeAdminRoutes } from "./routes/attribute-admin.routes.ts";
import { attributeRoutes } from "./routes/attribute.routes.ts";
import { brandAdminRoutes } from "./routes/brand-admin.routes.ts";
import { brandVendorRoutes } from "./routes/brand-vendor.routes.ts";
import { brandRoutes } from "./routes/brand.routes.ts";
import { categoryAdminRoutes } from "./routes/category-admin.routes.ts";
import { categoryRoutes } from "./routes/category.routes.ts";
import { collectionAdminRoutes } from "./routes/collection-admin.routes.ts";
import { collectionRoutes } from "./routes/collection.routes.ts";
import { ecoDeclarationAdminRoutes } from "./routes/eco-declaration-admin.routes.ts";
import { ecoDeclarationRoutes } from "./routes/eco-declaration.routes.ts";
import { internalInventoryRoutes } from "./routes/internal-inventory.routes.ts";
import { internalProductsRoutes } from "./routes/internal-products.routes.ts";
import { inventoryRoutes } from "./routes/inventory.routes.ts";
import { mediaRoutes } from "./routes/media.routes.ts";
import { productAiSettingsRoutes } from "./routes/product-ai-settings.routes.ts";
import { productGroupRoutes } from "./routes/product-group.routes.ts";
import { productRoutes } from "./routes/product.routes.ts";
import { recentSearchRoutes } from "./routes/recent-search.routes.ts";
import { recentlyViewedRoutes } from "./routes/recently-viewed.routes.ts";
import { recommendationRoutes } from "./routes/recommendation.routes.ts";
import { savedSearchRoutes } from "./routes/saved-search.routes.ts";
import { searchAdminRoutes } from "./routes/search-admin.routes.ts";
import { trendingRoutes } from "./routes/trending.routes.ts";
import { wishlistRoutes } from "./routes/wishlist.routes.ts";

export const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  .use(mediaRoutes)
  .use(categoryRoutes)
  .use(categoryAdminRoutes)
  .use(brandRoutes)
  .use(brandAdminRoutes)
  .use(brandVendorRoutes)
  .use(collectionAdminRoutes)
  .use(attributeRoutes)
  .use(attributeAdminRoutes)
  .use(searchAdminRoutes)
  .use(adminProductRoutes)
  .use(collectionRoutes)
  .use(ecoDeclarationRoutes)
  .use(ecoDeclarationAdminRoutes)
  .use(productRoutes)
  .use(productGroupRoutes)
  .use(inventoryRoutes)
  .use(internalInventoryRoutes)
  .use(internalProductsRoutes)
  .use(wishlistRoutes)
  .use(recentlyViewedRoutes)
  .use(recentSearchRoutes)
  .use(savedSearchRoutes)
  .use(recommendationRoutes)
  .use(trendingRoutes)
  .use(aiSettingsRoutes)
  .use(productAiSettingsRoutes)
  .use(bulkRoutes);
