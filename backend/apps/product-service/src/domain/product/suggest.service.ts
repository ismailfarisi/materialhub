import type { Brand, Category } from "@materialhub/database";
import { ILike, type Repository } from "typeorm";
import type {
  SearchService,
  SuggestBrand,
  SuggestCategory,
  SuggestResponse,
} from "../search/search.interface.ts";
import type { TrendingSearchService } from "../search/trending.service.ts";

export class SuggestService {
  constructor(
    private readonly searchService: SearchService,
    private readonly categoryRepo: Repository<Category>,
    private readonly brandRepo: Repository<Brand>,
    private readonly trendingService?: TrendingSearchService,
  ) {}

  async suggest(q: string, limit = 5): Promise<SuggestResponse> {
    const trimmed = (q ?? "").trim();
    if (trimmed.length < 2) {
      return { products: [], categories: [], brands: [], did_you_mean: null };
    }

    const namePattern = ILike(`%${trimmed}%`);
    const slugPattern = ILike(`%${trimmed.toLowerCase()}%`);

    // TODO: log per-bucket rejections once a logger is in scope.
    const [productsRes, categoriesRes, brandsRes] = await Promise.allSettled([
      this.searchService.suggest(trimmed, limit),
      this.categoryRepo.find({
        where: [{ name: namePattern }, { slug: slugPattern }],
        select: ["id", "name", "slug"],
        take: limit,
      }) as Promise<SuggestCategory[]>,
      this.brandRepo.find({
        where: [{ name: namePattern }, { slug: slugPattern }],
        select: ["id", "name", "slug"],
        take: limit,
      }) as Promise<SuggestBrand[]>,
    ]);

    const products = productsRes.status === "fulfilled" ? productsRes.value : [];
    const categories = categoriesRes.status === "fulfilled" ? categoriesRes.value : [];
    const brands = brandsRes.status === "fulfilled" ? brandsRes.value : [];

    if (products.length > 0 && this.trendingService) {
      this.trendingService.record(trimmed).catch(() => {});
    }

    const didYouMean =
      products.length === 0 && this.searchService.didYouMean
        ? await this.searchService.didYouMean(trimmed)
        : null;
    return { products, categories, brands, did_you_mean: didYouMean };
  }
}
