import { cn } from "@/lib/utils";
import { ProductCard } from "./product-card";

/**
 * The listing grid. Two columns on a phone, three from `md`; four from `xl`
 * once the 264px filter rail has taken its share. `wide` (search) adds a fifth
 * column at `2xl`. Every card is a `ProductCard` swatch.
 */
export function ProductGrid({
	products,
	wide = false,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: Product type not yet exported from product-card
	products: any[];
	/** @deprecated The list view was removed; the prop is ignored. */
	view?: string;
	wide?: boolean;
}) {
	return (
		<ul
			className={cn(
				"m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 md:gap-4 xl:grid-cols-4",
				wide && "2xl:grid-cols-5",
			)}
		>
			{products.map((product) => (
				<li key={product.id} className="min-w-0">
					<ProductCard product={product} />
				</li>
			))}
		</ul>
	);
}
